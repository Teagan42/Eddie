import { fetch } from "undici";
import type { ProviderAdapter, StreamEvent, StreamOptions } from "../types";

interface OpenAIConfig {
  baseUrl?: string;
  apiKey?: string;
}

interface ToolAccumulator {
  id?: string;
  name?: string;
  args: string;
}

export class OpenAIAdapter implements ProviderAdapter {
  readonly name = "openai";

  constructor(private readonly config: OpenAIConfig) {}

  private buildUrl(): string {
    return `${this.config.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`;
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamEvent> {
    const response = await fetch(this.buildUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey ?? process.env.OPENAI_API_KEY ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: true,
        tools: options.tools,
        response_format: options.responseFormat,
      }),
    });

    if (!response.ok || !response.body) {
      const message = `OpenAI request failed: ${response.status} ${response.statusText}`;
      yield { type: "error", message };
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

      const segments = buffer.split("\n\n");
      buffer = segments.pop() ?? "";

      for (const segment of segments) {
        const trimmed = segment.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          yield { type: "end" };
          return;
        }

        try {
          const json = JSON.parse(payload);
          const choice = json.choices?.[0];
          if (!choice) continue;

          if (choice.delta?.content) {
            yield { type: "delta", text: choice.delta.content };
          }

          if (Array.isArray(choice.delta?.tool_calls)) {
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

          if (choice.finish_reason === "tool_calls") {
            for (const accumulator of toolBuffer.values()) {
              let parsed: unknown = accumulator.args;
              try {
                parsed = JSON.parse(accumulator.args || "{}");
              } catch {
                // keep raw string if parsing fails
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
            return;
          }

          if (choice.finish_reason === "stop") {
            yield { type: "end", reason: "stop", usage: json.usage };
            return;
          }
        } catch (error) {
          yield {
            type: "error",
            message: "Failed to parse OpenAI stream payload",
            cause: error,
          };
        }
      }
    }
  }
}
