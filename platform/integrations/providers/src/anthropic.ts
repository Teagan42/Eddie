import { Injectable } from "@nestjs/common";
import { fetch } from "undici";
import type {
  ProviderAdapter,
  ProviderAdapterFactory,
  ProviderConfig,
  StreamEvent,
  StreamOptions,
} from "@eddie/types";
import { extractNotificationEvents } from "./notifications";
import { resolveResponseFormat } from "./response-format";

interface AnthropicConfig {
  baseUrl?: string;
  apiKey?: string;
}

interface ToolState {
  id?: string;
  name?: string;
  args: Record<string, unknown>;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly name = "anthropic";

  constructor(private readonly config: AnthropicConfig) {}

  private endpoint(): string {
    return `${this.config.baseUrl ?? "https://api.anthropic.com"}/v1/messages`;
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamEvent> {
    const responseFormat = resolveResponseFormat(options);

    const response = await fetch(this.endpoint(), {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 1024,
        messages: options.messages,
        tools: options.tools,
        stream: true,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });

    if (!response.ok || !response.body) {
      yield {
        type: "error",
        message: `Anthropic request failed: ${response.status} ${response.statusText}`,
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolStates = new Map<string, ToolState>();
    type ReasoningState = {
      id?: string;
      segments: string[];
      metadata: Record<string, unknown>;
    };
    const reasoningStates = new Map<string, ReasoningState>();

    const reasoningKey = (id?: string): string => id ?? "__default__";

    const toRecord = (value: unknown): Record<string, unknown> | undefined => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
      }

      return { ...(value as Record<string, unknown>) };
    };

    const extractText = (value: unknown): string | undefined => {
      if (typeof value === "string") {
        return value;
      }

      if (Array.isArray(value)) {
        const joined = value
          .map((item) => extractText(item))
          .filter((chunk): chunk is string => typeof chunk === "string" && chunk.trim().length > 0)
          .join(" ");
        return joined.length > 0 ? joined : undefined;
      }

      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.text === "string") {
          return record.text;
        }

        if (record.delta) {
          return extractText(record.delta);
        }

        if (typeof record.partial_json === "string") {
          return record.partial_json;
        }
      }

      return undefined;
    };

    const appendReasoning = (
      id: string | undefined,
      chunk: string | undefined,
    ): StreamEvent | undefined => {
      if (typeof chunk !== "string") {
        return undefined;
      }

      const normalized = chunk.trim();
      if (normalized.length === 0) {
        return undefined;
      }

      const key = reasoningKey(id);
      const state = reasoningStates.get(key) ?? {
        id,
        segments: [],
        metadata: {},
      };
      state.segments.push(normalized);
      if (id && typeof state.metadata.id !== "string") {
        state.metadata.id = id;
      }
      reasoningStates.set(key, state);

      return { type: "reasoning_delta", text: normalized, id };
    };

    const isReasoningComplete = (value: unknown): boolean => {
      if (!value || typeof value !== "object") {
        return false;
      }

      const record = value as Record<string, unknown>;
      const type = record.type;
      if (typeof type === "string" && /stop|complete|end|done/i.test(type)) {
        return true;
      }

      const completed = record.completed ?? record.done ?? record.is_final;
      if (typeof completed === "boolean") {
        return completed;
      }

      return false;
    };

    const finalizeReasoning = (
      id: string | undefined,
      metadataSource?: unknown,
    ): StreamEvent | undefined => {
      const key = reasoningKey(id);
      const state = reasoningStates.get(key);
      if (!state) {
        return undefined;
      }

      const metadata: Record<string, unknown> = { ...state.metadata };
      const metadataRecord = toRecord(metadataSource);
      if (metadataRecord) {
        Object.assign(metadata, metadataRecord);
      } else {
        const extracted = extractText(metadataSource);
        if (extracted && typeof metadata.text !== "string") {
          metadata.text = extracted;
        }
      }

      const aggregated = state.segments.join(" ");
      if (aggregated.length > 0 && typeof metadata.text !== "string") {
        metadata.text = aggregated;
      }

      reasoningStates.delete(key);

      if (typeof metadata.text !== "string" || metadata.text.length === 0) {
        return undefined;
      }

      return { type: "reasoning_end", metadata };
    };

    const finalizeAllReasoning = (metadataSource?: unknown): StreamEvent[] => {
      const events: StreamEvent[] = [];
      for (const key of [...reasoningStates.keys()]) {
        const state = reasoningStates.get(key);
        const event = finalizeReasoning(state?.id, metadataSource);
        if (event) {
          events.push(event);
        }
      }
      return events;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const trimmed = event.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          for (const event of finalizeAllReasoning()) {
            yield event;
          }
          yield { type: "end" };
          return;
        }

        try {
          const json = JSON.parse(payload);

          for (const notification of extractNotificationEvents(json)) {
            yield notification;
          }

          switch (json.type) {
            case "message_start":
            case "connection_ack":
              break;
            case "message_delta": {
              const thinking = json.delta?.thinking;
              if (thinking) {
                const id = typeof thinking.id === "string" ? thinking.id : undefined;
                if (!isReasoningComplete(thinking)) {
                  const reasoningEvent = appendReasoning(
                    id,
                    extractText((thinking as { delta?: unknown }).delta ?? thinking),
                  );
                  if (reasoningEvent) {
                    yield reasoningEvent;
                  }
                }

                if (isReasoningComplete(thinking)) {
                  const reasoningEnd = finalizeReasoning(id, thinking);
                  if (reasoningEnd) {
                    yield reasoningEnd;
                  }
                }
              }

              if (json.delta?.stop_reason) {
                for (const event of finalizeAllReasoning(json.delta?.thinking)) {
                  yield event;
                }
                yield { type: "end", reason: json.delta.stop_reason };
              }
              break;
            }
            case "thinking": {
              const thinking = json.thinking;
              if (!thinking) {
                break;
              }

              const id = typeof thinking.id === "string" ? thinking.id : undefined;
              const reasoningEvent = appendReasoning(
                id,
                extractText((thinking as { delta?: unknown }).delta ?? thinking),
              );
              if (reasoningEvent) {
                yield reasoningEvent;
              }

              if (isReasoningComplete(thinking)) {
                const reasoningEnd = finalizeReasoning(id, thinking);
                if (reasoningEnd) {
                  yield reasoningEnd;
                }
              }
              break;
            }
            case "content_block_start":
              if (json.content_block?.type === "tool_use") {
                const id = json.content_block.id ?? `${toolStates.size}`;
                toolStates.set(id, {
                  id,
                  name: json.content_block.name,
                  args: json.content_block.input ?? {},
                });
              }
              break;
            case "content_block_delta": {
              const block = json.delta;
              if (block?.type === "text_delta" && block.text) {
                yield { type: "delta", text: block.text };
              }
              if (block?.type === "tool_use_delta") {
                const id = json.content_block_id ?? "0";
                const state = toolStates.get(id) ?? { id, name: undefined, args: {} };
                Object.assign(state.args, block.partial_json ?? {});
                toolStates.set(id, state);
              }
              break;
            }
            case "content_block_stop": {
              const id = json.content_block_id;
              if (id && toolStates.has(id)) {
                const state = toolStates.get(id)!;
                yield {
                  type: "tool_call",
                  id: state.id,
                  name: state.name ?? "tool",
                  arguments: state.args,
                };
                toolStates.delete(id);
                for (const event of finalizeAllReasoning()) {
                  yield event;
                }
                return;
              }
              break;
            }
            default:
              break;
          }
        } catch (error) {
          yield {
            type: "error",
            message: "Failed to parse Anthropic stream payload",
            cause: error,
          };
        }
      }
    }

    for (const event of finalizeAllReasoning()) {
      yield event;
    }
  }
}

@Injectable()
export class AnthropicAdapterFactory implements ProviderAdapterFactory {
  readonly name = "anthropic";

  create(config: ProviderConfig): ProviderAdapter {
    return new AnthropicAdapter(this.toAdapterConfig(config));
  }

  async listModels(config: ProviderConfig): Promise<string[]> {
    const adapterConfig = this.toAdapterConfig(config);
    const baseUrl = (adapterConfig.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        "x-api-key": adapterConfig.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
    });

    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
    const data = Array.isArray(body.data) ? body.data : [];

    return data
      .map((item) => (typeof item?.id === "string" ? item.id : undefined))
      .filter((id): id is string => typeof id === "string");
  }

  private toAdapterConfig(config: ProviderConfig): AnthropicConfig {
    return {
      baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
      apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
    };
  }
}
