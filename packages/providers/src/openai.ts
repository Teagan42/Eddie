import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import type {
  EasyInputMessage,
  FunctionTool,
  Response as OpenAIResponse,
  ResponseFunctionToolCall,
  ResponseInput,
  ResponseInputItem,
  ResponseTextConfig,
} from "openai/resources/responses/responses";
import type { ProviderConfig } from "@eddie/config";
import type { ProviderAdapter, StreamEvent, StreamOptions, ToolSchema } from "@eddie/types";
import type { ProviderAdapterFactory } from "./provider.tokens";
import { extractNotificationEvents } from "./notifications";

interface OpenAIConfig {
  baseUrl?: string;
  apiKey?: string;
}

type ResponseStreamParams = Parameters<OpenAI["responses"]["stream"]>[0];
type ResponseStreamCreateParams = Extract<
  ResponseStreamParams,
  { input?: unknown }
>;
type ResponseFunctionTool = FunctionTool;
type ResponseMetadata = ResponseStreamCreateParams["metadata"] | undefined;
type ResponseFormat = ResponseTextConfig["format"];

interface ToolAccumulator {
  arguments: string;
  ids: Set<string>;
  callId?: string;
  name?: string;
}

export class OpenAIAdapter implements ProviderAdapter {
  readonly name = "openai";

  private readonly client: OpenAI;

  constructor(private readonly config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: this.config.apiKey || process.env.OPENAI_API_KEY || undefined,
      baseURL: this.config.baseUrl,
    });
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamEvent> {
    const toolBuffer = new Map<string, ToolAccumulator>();
    const emittedToolCallIds = new Set<string>();
    let stream: ReturnType<OpenAI["responses"]["stream"]>;

    const createAccumulator = (): ToolAccumulator => ({
      arguments: "",
      ids: new Set<string>(),
      callId: undefined,
      name: undefined,
    });

    const attachAccumulator = (
      identifier: string | undefined,
      accumulator: ToolAccumulator,
    ): void => {
      if (!identifier) {
        return;
      }

      if (!accumulator.ids.has(identifier)) {
        accumulator.ids.add(identifier);
      }

      toolBuffer.set(identifier, accumulator);
    };

    const ensureAccumulator = (
      identifier: string | undefined,
    ): ToolAccumulator => {
      if (identifier) {
        const existing = toolBuffer.get(identifier);
        if (existing) {
          return existing;
        }
      }

      const accumulator = createAccumulator();
      if (identifier) {
        attachAccumulator(identifier, accumulator);
      }
      return accumulator;
    };

    const clearAccumulator = (accumulator: ToolAccumulator): void => {
      for (const identifier of accumulator.ids) {
        toolBuffer.delete(identifier);
      }
      accumulator.ids.clear();
    };

    const streamParams = {
      model: options.model,
      input: this.formatMessages(options.messages),
      tools: this.formatTools(options.tools),
      metadata: this.formatMetadata(options.metadata),
      ...(options.responseFormat
        ? { text: this.formatResponseTextConfig(options.responseFormat) }
        : {}),
    } satisfies ResponseStreamCreateParams;

    try {
      stream = await this.client.responses.stream(streamParams);
    } catch (error) {
      yield {
        type: "error",
        message: "Failed to start OpenAI response stream",
        cause: error,
      };
      return;
    }

    let endReason: string | undefined;
    let usage: Record<string, unknown> | undefined;

    try {
      for await (const event of stream) {
        for (const notification of extractNotificationEvents(event)) {
          yield notification;
        }

        switch (event.type) {
          case "response.output_item.added": {
            const item = event.item as
              | { id?: string; call_id?: string; type?: string; name?: string }
              | undefined;
            if (!item || item.type !== "function_call") {
              break;
            }

            const accumulator = ensureAccumulator(item.id ?? item.call_id);
            attachAccumulator(item.id, accumulator);
            attachAccumulator(item.call_id, accumulator);
            if (item.call_id) {
              accumulator.callId = item.call_id;
            }
            if (typeof item.name === "string") {
              accumulator.name = item.name;
            }
            break;
          }
          case "response.output_text.delta": {
            yield { type: "delta", text: event.delta };
            break;
          }
          case "response.function_call_arguments.delta": {
            const callId = (event as { call_id?: string }).call_id;
            const eventName = (event as { name?: string }).name;
            const accumulator = ensureAccumulator(event.item_id ?? callId);
            accumulator.arguments += event.delta;
            attachAccumulator(event.item_id, accumulator);
            attachAccumulator(callId, accumulator);
            if (typeof eventName === "string") {
              accumulator.name = eventName;
            }
            break;
          }
          case "response.function_call_arguments.done": {
            const callId = (event as { call_id?: string }).call_id;
            const eventName = (event as { name?: string }).name;
            const accumulator = ensureAccumulator(event.item_id ?? callId);
            attachAccumulator(event.item_id, accumulator);
            attachAccumulator(callId, accumulator);
            if (typeof eventName === "string") {
              accumulator.name = eventName;
            }

            const buffered = accumulator.arguments;
            const raw = event.arguments ?? buffered;
            let parsed: unknown = raw;
            try {
              parsed = JSON.parse(raw || "{}");
            } catch {
              // Keep the raw string when JSON parsing fails.
            }
            const identifier =
              accumulator.callId ?? callId ?? event.item_id ?? undefined;
            yield {
              type: "tool_call",
              id: identifier,
              name: eventName ?? accumulator.name ?? "unknown_tool",
              arguments:
                typeof parsed === "object" && parsed !== null
                  ? (parsed as Record<string, unknown>)
                  : { input: parsed },
              raw,
            };
            for (const accId of accumulator.ids) {
              emittedToolCallIds.add(accId);
            }
            if (identifier) {
              emittedToolCallIds.add(identifier);
            }
            clearAccumulator(accumulator);
            break;
          }
          case "response.completed": {
            usage = this.normalizeUsage(event.response?.usage);
            endReason = event.response?.status ?? "completed";
            break;
          }
          case "response.failed": {
            usage = this.normalizeUsage(event.response?.usage);
            endReason = event.response?.status ?? "failed";
            yield {
              type: "error",
              message: event.response?.error?.message ?? "OpenAI response failed",
              cause: event.response,
            };
            break;
          }
          case "response.incomplete": {
            usage = this.normalizeUsage(event.response?.usage);
            endReason = event.response?.status ?? "incomplete";
            break;
          }
          case "error": {
            yield {
              type: "error",
              message: event.message,
              cause: { code: event.code, param: event.param },
            };
            break;
          }
          default: {
            // Ignore other event types for now.
            break;
          }
        }
      }
    } catch (error) {
      yield {
        type: "error",
        message: "OpenAI stream failed",
        cause: error,
      };
      return;
    }

    let finalResponse: OpenAIResponse | undefined;
    try {
      finalResponse = await stream.finalResponse();
    } catch {
      finalResponse = undefined;
    }

    if (finalResponse) {
      for (const notification of extractNotificationEvents(finalResponse)) {
        yield notification;
      }
      for (const item of finalResponse.output ?? []) {
        if ((item as { type?: string }).type !== "function_call") {
          continue;
        }

        const call = item as ResponseFunctionToolCall;
        const identifier = call.id ?? call.call_id;
        if (identifier && emittedToolCallIds.has(identifier)) {
          continue;
        }

        const accumulator = identifier ? toolBuffer.get(identifier) : undefined;
        const buffered = accumulator?.arguments ?? "";
        const raw = call.arguments ?? buffered;
        let parsed: unknown = raw;
        try {
          parsed = JSON.parse(raw || "{}");
        } catch {
          // Keep raw text fallback when parsing fails.
        }

        yield {
          type: "tool_call",
          id: identifier,
          name: accumulator?.name ?? call.name ?? "unknown_tool",
          arguments:
            typeof parsed === "object" && parsed !== null
              ? (parsed as Record<string, unknown>)
              : { input: parsed },
          raw,
        };

        if (identifier) {
          emittedToolCallIds.add(identifier);
          if (accumulator) {
            clearAccumulator(accumulator);
          } else {
            toolBuffer.delete(identifier);
          }
        }
      }

      usage = usage ?? this.normalizeUsage(finalResponse.usage);
      endReason = endReason ?? finalResponse.status ?? undefined;
    }

    yield { type: "end", reason: endReason, usage };
  }

  private formatMessages(messages: StreamOptions["messages"]): ResponseInput {
    return messages.map<ResponseInputItem>((message) => {
      if (message.role === "tool") {
        const callId = message.tool_call_id ?? message.name ?? "tool";

        return {
          call_id: callId,
          output: message.content,
          type: "function_call_output",
        } satisfies ResponseInputItem.FunctionCallOutput;
      }

      const role: EasyInputMessage["role"] =
        message.role === "system" ||
        message.role === "user" ||
        message.role === "assistant"
          ? message.role
          : "user";

      return {
        content: [{ type: "input_text", text: message.content }],
        role,
        type: "message",
      } satisfies EasyInputMessage;
    });
  }

  private formatTools(
    tools: ToolSchema[] | undefined,
  ): ResponseFunctionTool[] | undefined {
    if (!tools?.length) return undefined;

    return tools.map<ResponseFunctionTool>((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description ?? null,
      parameters: tool.parameters ?? null,
      strict: false,
    }));
  }

  private formatMetadata(
    metadata: StreamOptions["metadata"],
  ): ResponseMetadata {
    if (!metadata) {
      return undefined;
    }

    const normalized: Record<string, string> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined || value === null) {
        continue;
      }

      normalized[key] = typeof value === "string" ? value : JSON.stringify(value);
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private formatResponseTextConfig(
    format: StreamOptions["responseFormat"],
  ): ResponseStreamCreateParams["text"] {
    return {
      format: format as ResponseFormat,
    } satisfies ResponseTextConfig;
  }

  private normalizeUsage(usage?: unknown): Record<string, unknown> | undefined {
    if (!usage || typeof usage !== "object") {
      return undefined;
    }
    return usage as Record<string, unknown>;
  }
}

@Injectable()
export class OpenAIAdapterFactory implements ProviderAdapterFactory {
  readonly name = "openai";

  create(config: ProviderConfig): ProviderAdapter {
    const adapterConfig: OpenAIConfig = {
      baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
      apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
    };

    return new OpenAIAdapter(adapterConfig);
  }
}
