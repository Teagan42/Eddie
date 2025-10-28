import { Injectable } from "@nestjs/common";
import { Ollama as OllamaClient } from "ollama";
import type {
  ProviderAdapter,
  ProviderAdapterFactory,
  ProviderConfig,
  StreamEvent,
  StreamOptions,
  ToolSchema,
} from "@eddie/types";

interface OllamaConfig {
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

type OllamaChatChunk = {
  done?: boolean;
  done_reason?: string;
  message?: {
    content?: string;
    tool_calls?: {
      id?: string;
      function?: { name?: string; arguments?: Record<string, unknown> };
    }[];
  };
  error?: string;
  total_duration?: number;
  load_duration?: number;
  eval_duration?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
};

type OllamaChatStream = AsyncIterable<OllamaChatChunk>;

type OllamaMessage = {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_name?: string;
};

type OllamaTool = {
  type: string;
  function: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeHeaders = (
  headers: Record<string, string> | undefined,
  apiKey: string | undefined,
): Record<string, string> | undefined => {
  const merged: Record<string, string> = {};

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") {
        merged[key] = value;
      }
    }
  }

  if (apiKey && apiKey.length > 0) {
    merged.Authorization = `Bearer ${apiKey}`;
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
};

const createClient = (config: OllamaConfig): OllamaClient => {
  return new OllamaClient({
    host: config.baseUrl,
    headers: normalizeHeaders(config.headers, config.apiKey ?? process.env.OLLAMA_API_KEY),
  });
};

const commonPrefixLength = (a: string, b: string): number => {
  const max = Math.min(a.length, b.length);
  let index = 0;
  while (index < max && a[index] === b[index]) {
    index += 1;
  }
  return index;
};

const toHeadersRecord = (value: unknown): Record<string, string> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export class OllamaAdapter implements ProviderAdapter {
  readonly name = "ollama";

  private readonly client: OllamaClient;

  constructor(private readonly config: OllamaConfig) {
    this.client = createClient(config);
  }

  private formatMessages(messages: StreamOptions["messages"]): OllamaMessage[] {
    return messages.map((message) => {
      const normalizedRole = message.role === "developer" ? "system" : message.role;
      const formatted: OllamaMessage = {
        role: normalizedRole,
        content: message.content,
      };

      if (message.tool_call_id) {
        formatted.tool_call_id = message.tool_call_id;
      }

      if (message.role === "tool" && message.name) {
        formatted.tool_name = message.name;
      }

      if (message.role === "assistant" && message.name) {
        formatted.tool_name = message.name;
      }

      return formatted;
    });
  }

  private formatTools(tools: ToolSchema[] | undefined): OllamaTool[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private extractUsage(chunk: OllamaChatChunk): Record<string, number> | undefined {
    const usage: Record<string, number> = {};
    const numericFields: (keyof OllamaChatChunk)[] = [
      "total_duration",
      "load_duration",
      "eval_duration",
      "prompt_eval_duration",
      "eval_count",
      "prompt_eval_count",
    ];

    for (const field of numericFields) {
      const value = chunk[field];
      if (typeof value === "number" && Number.isFinite(value)) {
        usage[field] = value;
      }
    }

    return Object.keys(usage).length > 0 ? usage : undefined;
  }

  async *stream(options: StreamOptions): AsyncIterable<StreamEvent> {
    let stream: OllamaChatStream;

    try {
      stream = (await this.client.chat({
        model: options.model,
        messages: this.formatMessages(options.messages),
        tools: this.formatTools(options.tools),
        format: options.responseFormat,
        stream: true,
      })) as OllamaChatStream;
    } catch (error) {
      yield {
        type: "error",
        message: "Failed to start Ollama chat stream",
        cause: error,
      };
      return;
    }

    const emittedToolKeys = new Set<string>();
    let previousContent = "";

    const resolveToolKey = (tool: {
      id?: string;
      function?: { name?: string; arguments?: Record<string, unknown> };
    }): string => {
      if (tool.id) {
        return `id:${tool.id}`;
      }

      if (tool.function) {
        return `fn:${JSON.stringify(tool.function)}`;
      }

      return `tool:${JSON.stringify(tool)}`;
    };

    try {
      for await (const chunk of stream) {
        if (!chunk || typeof chunk !== "object") {
          continue;
        }

        if (typeof chunk.error === "string" && chunk.error.length > 0) {
          yield { type: "error", message: chunk.error };
          continue;
        }

        const message = chunk.message;
        if (message && typeof message === "object") {
          const content = (message as { content?: unknown }).content;
          if (typeof content === "string" && content.length > 0) {
            const computeDelta = (nextContent: string): string | undefined => {
              if (previousContent.length === 0) {
                previousContent = nextContent;
                return nextContent;
              }

              const prefixLength = commonPrefixLength(previousContent, nextContent);
              const appended = nextContent.slice(prefixLength);

              if (prefixLength === 0) {
                previousContent += nextContent;
                return nextContent;
              }

              if (prefixLength === nextContent.length) {
                previousContent = nextContent;
                return undefined;
              }

              if (prefixLength === previousContent.length) {
                previousContent = nextContent;
                return appended.length > 0 ? appended : undefined;
              }

              if (appended.length > 0) {
                previousContent = previousContent.slice(0, prefixLength) + appended;
                return appended;
              }

              previousContent = nextContent;
              return undefined;
            };

            const delta = computeDelta(content);
            if (delta && delta.length > 0) {
              yield { type: "delta", text: delta };
            }
          }

          const toolCalls = (message as { tool_calls?: unknown }).tool_calls;
          if (Array.isArray(toolCalls)) {
            for (const toolCall of toolCalls) {
              if (!isRecord(toolCall)) {
                continue;
              }

              const key = resolveToolKey(toolCall as {
                id?: string;
                function?: { name?: string; arguments?: Record<string, unknown> };
              });

              if (emittedToolKeys.has(key)) {
                continue;
              }

              emittedToolKeys.add(key);

              const fn = (toolCall as { function?: unknown }).function;
              const fnRecord = isRecord(fn) ? (fn as { name?: unknown; arguments?: unknown }) : undefined;
              const argumentsRecord = isRecord(fnRecord?.arguments)
                ? (fnRecord!.arguments as Record<string, unknown>)
                : {};

              yield {
                type: "tool_call",
                name: typeof fnRecord?.name === "string" ? fnRecord.name : "",
                id: typeof (toolCall as { id?: unknown }).id === "string" ? (toolCall as { id: string }).id : undefined,
                arguments: argumentsRecord,
              };
            }
          }
        }

        if (chunk.done) {
          const usage = this.extractUsage(chunk);
          const endEvent: StreamEvent = {
            type: "end",
          };

          if (typeof chunk.done_reason === "string") {
            endEvent.reason = chunk.done_reason;
          }

          if (usage) {
            endEvent.usage = usage;
          }

          yield endEvent;
          break;
        }
      }
    } catch (error) {
      yield { type: "error", message: "Ollama chat stream failed", cause: error };
    }
  }
}

@Injectable()
export class OllamaAdapterFactory implements ProviderAdapterFactory {
  readonly name = "ollama";

  create(config: ProviderConfig): ProviderAdapter {
    return new OllamaAdapter({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      headers: toHeadersRecord((config as { headers?: unknown }).headers),
    });
  }

  async listModels(config: ProviderConfig): Promise<string[]> {
    const client = createClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      headers: toHeadersRecord((config as { headers?: unknown }).headers),
    });

    const response = await client.list();
    if (!response || !Array.isArray(response.models)) {
      return [];
    }

    return response.models
      .map((model) => (isRecord(model) ? model.name : undefined))
      .filter((name): name is string => typeof name === "string" && name.length > 0);
  }
}
