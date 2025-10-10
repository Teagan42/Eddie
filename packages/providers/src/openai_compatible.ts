import { Injectable } from "@nestjs/common";
import { fetch } from "undici";
import type { ProviderConfig } from "@eddie/config";
import type { ProviderAdapter, StreamEvent, StreamOptions, ToolSchema } from "@eddie/types";
import type { ProviderAdapterFactory } from "./provider.tokens";
import { extractNotificationEvents } from "./notifications";

interface OpenAICompatConfig {
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

interface ToolAccumulator {
  id?: string;
  name?: string;
  args: string;
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name = "openai_compatible";

  constructor(private readonly config: OpenAICompatConfig) {}

  private endpoint(): string {
    return `${this.config.baseUrl ?? "https://api.groq.com/v1"}/chat/completions`;
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamEvent> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey ?? process.env.OPENAI_API_KEY ?? ""}`,
      ...this.config.headers,
    };

    const formattedTools = this.formatTools(options.tools);
    const response = await fetch(this.endpoint(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: options.model,
        stream: true,
        messages: options.messages,
        tools: formattedTools,
        tool_choice: formattedTools ? "auto" : undefined,
      }),
    });

    if (!response.ok || !response.body) {
      yield {
        type: "error",
        message: `OpenAI-compatible request failed: ${response.status} ${response.statusText}`,
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolBuffer = new Map<number, ToolAccumulator>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
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

          const delta = json.choices?.[0]?.delta;
          const choice = json.choices?.[0];
          const deltaContent = delta?.content;
          if (typeof deltaContent === "string") {
            yield { type: "delta", text: deltaContent };
          } else if (Array.isArray(deltaContent)) {
            for (const item of deltaContent) {
              if (
                item &&
                typeof item === "object" &&
                typeof (item as { text?: string }).text === "string"
              ) {
                yield { type: "delta", text: (item as { text: string }).text };
              }
            }
          }

          if (Array.isArray(choice?.delta?.tool_calls)) {
            for (const call of choice.delta.tool_calls) {
              const index = call.index ?? 0;
              const accumulator =
                toolBuffer.get(index) ?? { id: call.id, name: undefined, args: "" };
              if (call.id) accumulator.id = call.id;
              if (call.function?.name) accumulator.name = call.function.name;
              if (call.function?.arguments) {
                accumulator.args += call.function.arguments;
              }
              toolBuffer.set(index, accumulator);
            }
          }

          if (choice?.finish_reason === "tool_calls") {
            for (const accumulator of toolBuffer.values()) {
              let parsed: unknown = accumulator.args;
              try {
                parsed = JSON.parse(accumulator.args || "{}");
              } catch {
                // keep raw string when parsing fails
              }
              yield {
                type: "tool_call",
                id: accumulator.id,
                name: accumulator.name ?? "unknown_tool",
                arguments:
                  typeof parsed === "object" && parsed !== null
                    ? (parsed as Record<string, unknown>)
                    : { input: parsed },
                raw: accumulator.args,
              };
            }
            toolBuffer.clear();
            continue;
          }

          if (choice?.finish_reason === "stop") {
            yield { type: "end", reason: "stop", usage: json.usage };
            return;
          }
        } catch (error) {
          yield {
            type: "error",
            message: "Failed to parse OpenAI-compatible payload",
            cause: error,
          };
        }
      }
    }
  }

  private formatTools(tools: ToolSchema[] | undefined) {
    if (!tools) return undefined;

    return tools.map((tool) => ({
      type: tool.type,
      function: {
        name: tool.name,
        parameters: tool.parameters,
        ...(tool.description ? { description: tool.description } : {}),
      },
    }));
  }
}

@Injectable()
export class OpenAICompatibleAdapterFactory
  implements ProviderAdapterFactory
{
  readonly name = "openai_compatible";

  create(config: ProviderConfig): ProviderAdapter {
    return new OpenAICompatibleAdapter(this.toAdapterConfig(config));
  }

  async listModels(config: ProviderConfig): Promise<string[]> {
    const adapterConfig = this.toAdapterConfig(config);
    const baseUrl = (adapterConfig.baseUrl ?? "https://api.groq.com/v1").replace(/\/$/, "");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${
        adapterConfig.apiKey ?? process.env.OPENAI_API_KEY ?? ""
      }`,
      "Content-Type": "application/json",
      ...adapterConfig.headers,
    };

    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers,
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

  private toAdapterConfig(config: ProviderConfig): OpenAICompatConfig {
    return {
      baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
      apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
      headers:
        config.headers && typeof config.headers === "object"
          ? (config.headers as Record<string, string>)
          : undefined,
    };
  }
}

