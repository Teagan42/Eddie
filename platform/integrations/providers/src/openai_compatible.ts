import { Injectable } from "@nestjs/common";
import { fetch } from "undici";
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

type TextContentPart = { type: "text"; text: string; };

type NormalizedAssistantMessage = {
  role: "assistant";
  content: TextContentPart[];
  name?: string;
  tool_calls?: {
    id?: string;
    type: "function";
    function: { name: string; arguments: string; };
  }[];
};

type NormalizedBaseMessage = {
  role: "system" | "user";
  content: TextContentPart[];
  name?: string;
};

type NormalizedToolMessage = {
  role: "tool";
  content: string;
  tool_call_id?: string;
};

type NormalizedChatMessage =
  | NormalizedAssistantMessage
  | NormalizedBaseMessage
  | NormalizedToolMessage;

export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name = "openai_compatible";

  constructor(private readonly config: OpenAICompatConfig) { }

  private endpoint(): string {
    return `${ this.config.baseUrl ?? "https://api.groq.com/v1" }/chat/completions`;
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamEvent> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ this.config.apiKey ?? process.env.OPENAI_API_KEY ?? "" }`,
      ...this.config.headers,
    };

    const formattedMessages = this.formatMessages(options.messages);
    const formattedTools = this.formatTools(options.tools);
    const responseFormat = resolveResponseFormat(options);
    const response = await fetch(this.endpoint(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: options.model,
        stream: true,
        messages: formattedMessages,
        tools: formattedTools,
        tool_choice: formattedTools ? "auto" : undefined,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });

    if (!response.ok || !response.body) {
      yield {
        type: "error",
        message: `OpenAI-compatible request failed: ${ response.status } ${ response.statusText }`,
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolBuffer = new Map<number, ToolAccumulator>();
    const reasoningSegments: string[] = [];
    let reasoningCompleted = false;
    const LOOKAHEAD_WINDOW = 10;
    let pendingAssistantContent = "";
    let reasoningRecentlyEmitted = false;

    const pushReasoningChunk = (chunk: string | undefined): StreamEvent | undefined => {
      if (typeof chunk !== "string") {
        return undefined;
      }

      const normalized = chunk.trim();
      if (normalized.length === 0) {
        return undefined;
      }

      reasoningSegments.push(normalized);
      reasoningRecentlyEmitted = true;
      return { type: "reasoning_delta", text: normalized };
    };

    const emitReasoningEnd = (): StreamEvent | undefined => {
      if (reasoningCompleted) {
        return undefined;
      }

      const text = reasoningSegments.join("");
      if (text.length === 0) {
        return undefined;
      }

      reasoningCompleted = true;
      return { type: "reasoning_end", metadata: { text } };
    };

    const extractReasoningChunks = (value: unknown): string[] => {
      const chunks: string[] = [];
      const visit = (input: unknown): void => {
        if (typeof input === "string") {
          chunks.push(input);
          return;
        }

        if (Array.isArray(input)) {
          for (const item of input) {
            visit(item);
          }
          return;
        }

        if (input && typeof input === "object") {
          const record = input as Record<string, unknown>;
          if (typeof record.text === "string") {
            visit(record.text);
          }
        }
      };

      visit(value);
      return chunks;
    };

    const extractThinkSegments = (value: string): {
      reasoning: string[];
      remainder: string;
    } => {
      const reasoning: string[] = [];
      const remainder = value.replace(
        /<([\w:.-]*?)think>([\s\S]*?)<\/\1think>/gi,
        (_match, _prefix, inner) => {
          const text = typeof inner === "string" ? inner.trim() : "";
          if (text.length > 0) {
            reasoning.push(text);
          }
          return "";
        },
      );

      return { reasoning, remainder };
    };

    const escapeForRegex = (value: string): string =>
      value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");

    const findIncompleteThinkStart = (text: string): number | undefined => {
      const pattern = /<([\w:.-]*?)think>/gi;
      let match: RegExpExecArray | null;
      let lastMatch: RegExpExecArray | null = null;

      while ((match = pattern.exec(text)) !== null) {
        lastMatch = match;
      }

      if (!lastMatch) {
        return undefined;
      }

      const prefix = lastMatch[ 1 ] ?? "";
      const closingPattern = new RegExp(`</${ escapeForRegex(prefix) }think>`, "i");
      if (closingPattern.test(text.slice(lastMatch.index + lastMatch[ 0 ].length))) {
        return undefined;
      }

      return lastMatch.index;
    };

    const findPartialClosingTag = (text: string): number | undefined => {
      const lastOpen = text.lastIndexOf("<");
      if (lastOpen === -1) {
        return undefined;
      }

      const tail = text.slice(lastOpen);
      if (/^<\/[\w:.-]*?think>?$/i.test(tail) && !tail.endsWith(">")) {
        return lastOpen;
      }

      return undefined;
    };

    const emitContentSegment = (segment: string): StreamEvent[] => {
      const emitted: StreamEvent[] = [];
      const { reasoning, remainder } = extractThinkSegments(segment);

      for (const chunk of reasoning) {
        const event = pushReasoningChunk(chunk);
        if (event) {
          emitted.push(event);
        }
      }

      const cleaned =
        reasoning.length > 0 || reasoningRecentlyEmitted
          ? remainder.replace(/^\s+/, "")
          : remainder;

      if (cleaned.length > 0) {
        emitted.push({ type: "delta", text: cleaned });
        reasoningRecentlyEmitted = false;
      }

      return emitted;
    };

    const flushPendingAssistantContent = (force = false): StreamEvent[] => {
      const events: StreamEvent[] = [];

      while (pendingAssistantContent.length > 0) {
        let processLength = force
          ? pendingAssistantContent.length
          : pendingAssistantContent.length - LOOKAHEAD_WINDOW;

        if (processLength <= 0) {
          break;
        }

        let segment = pendingAssistantContent.slice(0, processLength);
        if (!force) {
          const incompleteIndex = findIncompleteThinkStart(segment);
          if (incompleteIndex !== undefined) {
            processLength = incompleteIndex;
            segment = pendingAssistantContent.slice(0, processLength);
          }

          const partialClosingIndex = findPartialClosingTag(segment);
          if (partialClosingIndex !== undefined) {
            processLength = partialClosingIndex;
            segment = pendingAssistantContent.slice(0, processLength);
          }
        }

        if (processLength <= 0) {
          break;
        }

        pendingAssistantContent = pendingAssistantContent.slice(processLength);

        if (segment.length === 0) {
          continue;
        }

        events.push(...emitContentSegment(segment));
      }

      return events;
    };

    const appendAssistantContent = (content: string): StreamEvent[] => {
      pendingAssistantContent += content;
      return flushPendingAssistantContent();
    };

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
          for (const event of flushPendingAssistantContent(true)) {
            yield event;
          }
          const reasoningEnd = emitReasoningEnd();
          if (reasoningEnd) {
            yield reasoningEnd;
          }
          yield { type: "end" };
          return;
        }

        try {
          const json = JSON.parse(payload);

          for (const notification of extractNotificationEvents(json)) {
            yield notification;
          }

          const delta = json.choices?.[ 0 ]?.delta;
          const choice = json.choices?.[ 0 ];

          if (delta) {
            const reasoningContent = (delta as { reasoning_content?: unknown; }).reasoning_content;
            for (const chunk of extractReasoningChunks(reasoningContent)) {
              const event = pushReasoningChunk(chunk);
              if (event) {
                yield event;
              }
            }
          }

          const deltaContent = delta?.content;
          if (typeof deltaContent === "string") {
            for (const event of appendAssistantContent(deltaContent)) {
              yield event;
            }
          } else if (Array.isArray(deltaContent)) {
            for (const item of deltaContent) {
              if (typeof item === "string") {
                for (const event of appendAssistantContent(item)) {
                  yield event;
                }
                continue;
              }

              if (item && typeof item === "object") {
                const text = (item as { text?: unknown; }).text;
                if (typeof text === "string") {
                  for (const event of appendAssistantContent(text)) {
                    yield event;
                  }
                }
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
            for (const event of flushPendingAssistantContent(true)) {
              yield event;
            }
            const reasoningEnd = emitReasoningEnd();
            if (reasoningEnd) {
              yield reasoningEnd;
            }
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

  private formatMessages(messages: StreamOptions[ "messages" ]): NormalizedChatMessage[] {
    const toTextSegments = (content: string): TextContentPart[] => [
      { type: "text" as const, text: content },
    ];

    return messages.map((message) => {
      const content = typeof message.content === "string" ? message.content : "";

      if (message.role === "tool") {
        const toolMessage: NormalizedToolMessage = {
          role: "tool",
          content,
        };

        if (message.tool_call_id) {
          toolMessage.tool_call_id = message.tool_call_id;
        }

        return toolMessage;
      }

      if (message.role === "assistant") {
        const assistant: NormalizedAssistantMessage = {
          role: "assistant",
          content: toTextSegments(content),
        };

        if (message.tool_call_id) {
          assistant.tool_calls = [
            {
              id: message.tool_call_id,
              type: "function" as const,
              function: {
                name: message.name ?? "tool",
                arguments: content,
              },
            },
          ];

        } else if (message.name) {
          assistant.name = message.name;
        }

        return assistant;
      }

      if (message.role === "system") {
        const normalized: NormalizedBaseMessage = {
          role: "system",
          content: toTextSegments(content),
        };

        if (message.name) {
          normalized.name = message.name;
        }

        return normalized;
      }

      const normalized: NormalizedBaseMessage = {
        role: "user",
        content: toTextSegments(content),
      };

      if (message.name) {
        normalized.name = message.name;
      }

      return normalized;
    });
  }
}

@Injectable()
export class OpenAICompatibleAdapterFactory
implements ProviderAdapterFactory {
  readonly name = "openai_compatible";

  create(config: ProviderConfig): ProviderAdapter {
    return new OpenAICompatibleAdapter(this.toAdapterConfig(config));
  }

  async listModels(config: ProviderConfig): Promise<string[]> {
    const adapterConfig = this.toAdapterConfig(config);
    const baseUrl = (adapterConfig.baseUrl ?? "https://api.groq.com/v1").replace(/\/$/, "");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${ adapterConfig.apiKey ?? process.env.OPENAI_API_KEY ?? ""
      }`,
      "Content-Type": "application/json",
      ...adapterConfig.headers,
    };

    const response = await fetch(`${ baseUrl }/models`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as { data?: Array<{ id?: unknown; }>; };
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

