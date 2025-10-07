import { Injectable } from "@nestjs/common";
import { fetch } from "undici";
import type { ProviderConfig } from "../../config/types";
import type { ProviderAdapter, StreamEvent, StreamOptions } from "../types";
import type { ProviderAdapterFactory } from "./provider.tokens";

interface OpenAICompatConfig {
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
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

    const response = await fetch(this.endpoint(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: options.model,
        stream: true,
        messages: options.messages,
        tools: options.tools,
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
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            yield { type: "delta", text: delta.content };
          }
          if (json.choices?.[0]?.finish_reason === "stop") {
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
}

@Injectable()
export class OpenAICompatibleAdapterFactory
  implements ProviderAdapterFactory
{
  readonly name = "openai_compatible";

  create(config: ProviderConfig): ProviderAdapter {
    const adapterConfig: OpenAICompatConfig = {
      baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : undefined,
      apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
      headers:
        config.headers && typeof config.headers === "object"
          ? (config.headers as Record<string, string>)
          : undefined,
    };

    return new OpenAICompatibleAdapter(adapterConfig);
  }
}

