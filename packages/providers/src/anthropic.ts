import { Injectable } from "@nestjs/common";
import { fetch } from "undici";
import type { ProviderConfig } from "@eddie/config";
import type { ProviderAdapter, StreamEvent, StreamOptions } from "@eddie/types";
import type { ProviderAdapterFactory } from "./provider.tokens";
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
            case "message_delta":
              if (json.delta?.stop_reason) {
                yield { type: "end", reason: json.delta.stop_reason };
              }
              break;
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
