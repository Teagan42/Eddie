import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import type {
  Response as OpenAIResponse,
  ResponseFunctionToolCall,
  ResponseTextConfig,
} from "openai/resources/responses/responses";
import type { ProviderConfig } from "../../config/types";
import type { ProviderAdapter, StreamEvent, StreamOptions, ToolSchema } from "../types";
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
type ResponseTools = NonNullable<ResponseStreamCreateParams["tools"]>;
type ResponseTool = ResponseTools extends Array<infer Tool>
  ? Tool
  : never;
type ResponseFunctionTool = Extract<ResponseTool, { type: "function" }>;
type ResponseInput = NonNullable<ResponseStreamCreateParams["input"]>;
type ResponseMetadata = ResponseStreamCreateParams["metadata"];
type ResponseFormat = ResponseTextConfig["format"];

interface ToolAccumulator {
  arguments: string;
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

    try {
      stream = await this.client.responses.stream({
        model: options.model,
        input: this.formatMessages(options.messages),
        tools: this.formatTools(options.tools),
        metadata: this.formatMetadata(options.metadata),
        ...(options.responseFormat
          ? { text: this.formatResponseTextConfig(options.responseFormat) }
          : {}),
      } satisfies ResponseStreamCreateParams);
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
          case "response.output_text.delta": {
            yield { type: "delta", text: event.delta };
            break;
          }
          case "response.function_call_arguments.delta": {
            const existing = toolBuffer.get(event.item_id) ?? { arguments: "" };
            existing.arguments += event.delta;
            toolBuffer.set(event.item_id, existing);
            break;
          }
          case "response.function_call_arguments.done": {
            const buffered = toolBuffer.get(event.item_id)?.arguments ?? "";
            const raw = event.arguments ?? buffered;
            let parsed: unknown = raw;
            try {
              parsed = JSON.parse(raw || "{}");
            } catch {
              // Keep the raw string when JSON parsing fails.
            }
            yield {
              type: "tool_call",
              id: event.item_id,
              name: event.name ?? "unknown_tool",
              arguments:
                typeof parsed === "object" && parsed !== null
                  ? (parsed as Record<string, unknown>)
                  : { input: parsed },
              raw,
            };
            toolBuffer.delete(event.item_id);
            emittedToolCallIds.add(event.item_id);
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

        const buffered = identifier ? toolBuffer.get(identifier)?.arguments ?? "" : "";
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
          name: call.name ?? "unknown_tool",
          arguments:
            typeof parsed === "object" && parsed !== null
              ? (parsed as Record<string, unknown>)
              : { input: parsed },
          raw,
        };

        if (identifier) {
          emittedToolCallIds.add(identifier);
          toolBuffer.delete(identifier);
        }
      }

      usage = usage ?? this.normalizeUsage(finalResponse.usage);
      endReason = endReason ?? finalResponse.status ?? undefined;
    }

    yield { type: "end", reason: endReason, usage };
  }

  private formatMessages(messages: StreamOptions["messages"]): ResponseInput {
    return messages.map((message) => {
      if (message.role === "tool") {
        return {
          type: "function_call_output",
          call_id: message.tool_call_id ?? message.name ?? "tool",
          output: message.content,
        } satisfies ResponseInput[number];
      }

      return {
        role: message.role === "system" || message.role === "user" || message.role === "assistant"
          ? message.role
          : "user",
        content: [{ type: "input_text", text: message.content }],
        type: "message",
      } satisfies ResponseInput[number];
    }) as ResponseInput;
  }

  private formatTools(tools: ToolSchema[] | undefined): ResponseTool[] | undefined {
    if (!tools) return undefined;

    return tools.map<ResponseFunctionTool>((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description ?? null,
      parameters: (tool.parameters ?? null) as ResponseFunctionTool["parameters"],
      strict: true,
    })) as ResponseTool[];
  }

  private formatMetadata(metadata: StreamOptions["metadata"]): ResponseMetadata {
    if (!metadata) {
      return undefined;
    }

    return metadata as ResponseMetadata;
  }

  private formatResponseTextConfig(
    format: StreamOptions["responseFormat"],
  ): ResponseTextConfig {
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
