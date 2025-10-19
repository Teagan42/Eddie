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
import type {
  ProviderAdapter,
  ProviderAdapterFactory,
  ProviderConfig,
  StreamEvent,
  StreamOptions,
  ToolSchema,
} from "@eddie/types";
import { extractNotificationEvents } from "./notifications";
import { resolveResponseFormat } from "./response-format";

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
    const toolBufferByIndex = new Map<number, ToolAccumulator>();
    const emittedToolCallIds = new Set<string>();
    let currentResponseId: string | undefined;
    let stream: ReturnType<OpenAI["responses"]["stream"]>;

    const createAccumulator = (): ToolAccumulator => ({
      arguments: "",
      callId: undefined,
      name: undefined,
    });

    const ensureAccumulatorByIndex = (index: number): ToolAccumulator => {
      const existing = toolBufferByIndex.get(index);
      if (existing) {
        return existing;
      }

      const accumulator = createAccumulator();
      toolBufferByIndex.set(index, accumulator);
      return accumulator;
    };

    const clearAccumulatorByIndex = (index: number): void => {
      toolBufferByIndex.delete(index);
    };

    const findAccumulatorEntryByCallId = (
      callId: string | undefined,
    ): { index: number; accumulator: ToolAccumulator } | undefined => {
      if (!callId) {
        return undefined;
      }

      for (const [index, accumulator] of toolBufferByIndex.entries()) {
        if (accumulator.callId === callId) {
          return { index, accumulator };
        }
      }

      return undefined;
    };

    const resolveOutputIndex = (value: { output_index?: number }): number =>
      typeof value.output_index === "number" ? value.output_index : -1;

    const responseFormat = resolveResponseFormat(options);

    const streamParams = {
      model: options.model,
      input: this.formatMessages(options.messages),
      tools: this.formatTools(options.tools),
      metadata: this.formatMetadata(options.metadata),
      ...(options.previousResponseId
        ? { previous_response_id: options.previousResponseId }
        : {}),
      ...(responseFormat
        ? { text: this.formatResponseTextConfig(responseFormat) }
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
    const reasoningSegments: string[] = [];
    let reasoningCompleted = false;
    let reasoningResponseId: string | undefined;

    const toRecord = (value: unknown): Record<string, unknown> | undefined => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
      }

      return { ...(value as Record<string, unknown>) };
    };

    const extractReasoningText = (value: unknown): string | undefined => {
      if (!value) {
        return undefined;
      }

      if (typeof value === "string") {
        return value;
      }

      if (Array.isArray(value)) {
        const joined = value
          .map((item) => extractReasoningText(item))
          .filter((chunk): chunk is string => typeof chunk === "string" && chunk.length > 0)
          .join("");
        return joined.length > 0 ? joined : undefined;
      }

      if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.text === "string") {
          return record.text;
        }

        if (typeof record.output_text === "string") {
          return record.output_text;
        }

        if (Array.isArray(record.output_text)) {
          const joined = record.output_text
            .map((item) => extractReasoningText(item))
            .filter(
              (chunk): chunk is string =>
                typeof chunk === "string" && chunk.length > 0,
            )
            .join("");
          return joined.length > 0 ? joined : undefined;
        }

        if (Array.isArray(record.content)) {
          const joined = record.content
            .map((item) => extractReasoningText(item))
            .filter(
              (chunk): chunk is string =>
                typeof chunk === "string" && chunk.length > 0,
            )
            .join("");
          return joined.length > 0 ? joined : undefined;
        }
      }

      return undefined;
    };

    const aggregatedReasoningText = (): string | undefined => {
      return reasoningSegments.length > 0
        ? reasoningSegments.join("")
        : undefined;
    };

    const pushReasoningSegment = (segment: string | undefined): string | undefined => {
      if (typeof segment !== "string") {
        return undefined;
      }

      if (segment.length === 0) {
        return undefined;
      }

      const normalized = segment.trim();
      if (normalized.length === 0) {
        return undefined;
      }

      reasoningSegments.push(normalized);
      return normalized;
    };

    const maybeEmitReasoningDelta = (segment: string | undefined): StreamEvent | undefined => {
      const chunk = pushReasoningSegment(segment);
      if (!chunk) {
        return undefined;
      }

      return { type: "reasoning_delta", text: chunk };
    };

    const maybeEmitReasoningEnd = (
      reasoning: unknown,
      responseId?: string,
    ): StreamEvent | undefined => {
      if (reasoningCompleted) {
        return undefined;
      }

      const metadata = toRecord(reasoning) ?? {};
      const aggregatedFromPayload = extractReasoningText(reasoning);
      const aggregatedFromSegments = aggregatedReasoningText();

      if (aggregatedFromPayload && typeof metadata.text !== "string") {
        metadata.text = aggregatedFromPayload;
      }

      if (!metadata.text && aggregatedFromSegments) {
        metadata.text = aggregatedFromSegments;
      }

      if (typeof metadata.text !== "string" || metadata.text.length === 0) {
        return undefined;
      }

      reasoningCompleted = true;

      return {
        type: "reasoning_end",
        metadata,
        responseId: responseId ?? reasoningResponseId ?? currentResponseId,
      } satisfies StreamEvent;
    };

    const assignReasoningResponseId = (
      response: { id?: string } | undefined,
    ): void => {
      reasoningResponseId =
        response?.id ?? reasoningResponseId ?? currentResponseId;
    };

    try {
      for await (const event of stream) {
        if (event.type === "response.created") {
          currentResponseId = event.response?.id;
        }
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

            const index = resolveOutputIndex(event);
            const accumulator = ensureAccumulatorByIndex(index);
            if (item.call_id) {
              accumulator.callId = item.call_id;
            }
            if (typeof item.name === "string") {
              accumulator.name = item.name;
            }
            break;
          }
          case "response.reasoning_text.delta": {
            assignReasoningResponseId(
              (event as { response?: { id?: string } }).response,
            );
            const emitted = maybeEmitReasoningDelta(
              (event as { delta?: unknown }).delta as string | undefined,
            );
            if (emitted) {
              yield emitted;
            }
            break;
          }
          case "response.reasoning_text.done": {
            const response = (event as { response?: { id?: string } })
              .response;
            assignReasoningResponseId(response);
            const reasoningEnd = maybeEmitReasoningEnd(
              (event as { response?: { reasoning?: unknown } }).response
                ?.reasoning,
              response?.id,
            );
            if (reasoningEnd) {
              yield reasoningEnd;
            }
            break;
          }
          case "response.output_text.delta": {
            yield { type: "delta", text: event.delta };
            break;
          }
          case "response.function_call_arguments.delta": {
            const index = resolveOutputIndex(event);
            const accumulator = ensureAccumulatorByIndex(index);
            accumulator.arguments += event.delta;
            const callId = (event as { call_id?: string }).call_id;
            if (callId) {
              accumulator.callId = callId;
            }
            const eventName = (event as { name?: string }).name;
            if (typeof eventName === "string") {
              accumulator.name = eventName;
            }
            break;
          }
          case "response.function_call_arguments.done": {
            const index = resolveOutputIndex(event);
            const accumulator = ensureAccumulatorByIndex(index);
            const callId = (event as { call_id?: string }).call_id;
            if (callId) {
              accumulator.callId = callId;
            }
            const eventName = (event as { name?: string }).name;
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
            const identifier = accumulator.callId ?? callId;
            if (!identifier) {
              break;
            }
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
            emittedToolCallIds.add(identifier);
            clearAccumulatorByIndex(index);
            break;
          }
          case "response.completed": {
            usage = this.normalizeUsage(event.response?.usage);
            endReason = event.response?.status ?? "completed";
            assignReasoningResponseId(event.response);
            const reasoningEnd = maybeEmitReasoningEnd(
              event.response?.reasoning,
              event.response?.id,
            );
            if (reasoningEnd) {
              yield reasoningEnd;
            }
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
      currentResponseId = currentResponseId ?? finalResponse.id;
      reasoningResponseId = reasoningResponseId ?? finalResponse.id;
      for (const notification of extractNotificationEvents(finalResponse)) {
        yield notification;
      }
      for (const item of finalResponse.output ?? []) {
        if ((item as { type?: string }).type !== "function_call") {
          continue;
        }

        const call = item as ResponseFunctionToolCall;
        const identifier = call.call_id ?? undefined;
        if (!identifier || emittedToolCallIds.has(identifier)) {
          continue;
        }

        const accumulatorEntry = findAccumulatorEntryByCallId(identifier);
        const buffered = accumulatorEntry?.accumulator.arguments ?? "";
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
          name:
            call.name ?? accumulatorEntry?.accumulator.name ?? "unknown_tool",
          arguments:
            typeof parsed === "object" && parsed !== null
              ? (parsed as Record<string, unknown>)
              : { input: parsed },
          raw,
        };

        emittedToolCallIds.add(identifier);
        if (accumulatorEntry) {
          clearAccumulatorByIndex(accumulatorEntry.index);
        }
      }

      const finalReasoningEnd = maybeEmitReasoningEnd(
        (finalResponse as { reasoning?: unknown }).reasoning,
        finalResponse.id,
      );
      if (finalReasoningEnd) {
        yield finalReasoningEnd;
      }

      usage = usage ?? this.normalizeUsage(finalResponse.usage);
      endReason = endReason ?? finalResponse.status ?? undefined;
    }

    if (!reasoningCompleted) {
      const reasoningEnd = maybeEmitReasoningEnd(undefined, currentResponseId);
      if (reasoningEnd) {
        yield reasoningEnd;
      }
    }

    yield { type: "end", reason: endReason, usage, responseId: currentResponseId };
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
        content: message.content,
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
    const normalizedFormat =
      format && typeof format === "object"
        ? this.normalizeResponseFormatObject(format)
        : format;

    return {
      format: normalizedFormat as ResponseFormat,
    } satisfies ResponseTextConfig;
  }

  private normalizeResponseFormatObject(
    format: object,
  ): Record<string, unknown> {
    const normalized = { ...format } as Record<string, unknown>;
    const name = normalized.name;
    if (typeof name === "string") {
      normalized.name = this.sanitizeResponseFormatName(name);
    }
    return normalized;
  }

  private sanitizeResponseFormatName(name: string): string {
    const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    return sanitized.length > 0 ? sanitized : "response_format";
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
    return new OpenAIAdapter(this.toAdapterConfig(config));
  }

  async listModels(config: ProviderConfig): Promise<string[]> {
    const adapterConfig = this.toAdapterConfig(config);
    const client = new OpenAI({
      apiKey: adapterConfig.apiKey || process.env.OPENAI_API_KEY || undefined,
      baseURL: adapterConfig.baseUrl,
    });

    const response = await client.models.list();
    const data = Array.isArray(response.data) ? response.data : [];

    return data
      .map((item) => (typeof item?.id === "string" ? item.id : undefined))
      .filter((id): id is string => typeof id === "string");
  }

  private toAdapterConfig(config: ProviderConfig): OpenAIConfig {
    return {
      baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
      apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
    };
  }
}
