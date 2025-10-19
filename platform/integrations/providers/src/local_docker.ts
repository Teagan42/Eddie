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

interface LocalDockerRunnerConfig {
  baseUrl?: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

type ToolBuffer = {
  id?: string;
  name?: string;
  arguments: string;
};

const DEFAULT_RUNNER_BASE_URL = "http://127.0.0.1:3210";

const createHeaders = (
  config: LocalDockerRunnerConfig,
): Record<string, string> => ({
  "Content-Type": "application/json",
  ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  ...config.headers,
});

export class LocalDockerModelRunnerAdapter implements ProviderAdapter {
  readonly name = "local_docker";

  constructor(private readonly config: LocalDockerRunnerConfig) {}

  async *stream(options: StreamOptions): AsyncIterable<StreamEvent> {
    const baseUrl = this.resolveBaseUrl();
    const headers = createHeaders(this.config);

    const responseFormat = resolveResponseFormat(options);
    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        metadata: options.metadata,
        ...(options.previousResponseId
          ? { previous_response_id: options.previousResponseId }
          : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
    });

    if (!response.ok || !response.body) {
      yield {
        type: "error",
        message: `Local docker runner request failed: ${response.status} ${response.statusText}`,
      } as const;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let responseId: string | undefined;
    const toolBuffers = new Map<string, ToolBuffer>();

    const ensureBuffer = (id: string): ToolBuffer => {
      const existing = toolBuffers.get(id);
      if (existing) {
        return existing;
      }
      const created: ToolBuffer = { id, name: undefined, arguments: "" };
      toolBuffers.set(id, created);
      return created;
    };

    const flushToolCall = (
      id: string,
      overrides?: { name?: string; arguments?: string },
    ) => {
      const buffer = toolBuffers.get(id);
      if (!buffer) {
        return;
      }

      const name = overrides?.name ?? buffer.name ?? "tool_call";
      const rawArguments = overrides?.arguments ?? buffer.arguments;
      let parsed: unknown = rawArguments;
      try {
        parsed = JSON.parse(rawArguments || "{}");
      } catch {
        // keep raw string when parsing fails
      }

      const normalizedArguments =
        typeof parsed === "object" && parsed !== null
          ? (parsed as Record<string, unknown>)
          : { input: parsed };

      toolBuffers.delete(id);
      return {
        type: "tool_call" as const,
        id,
        name,
        arguments: normalizedArguments,
        raw: rawArguments,
      } satisfies StreamEvent;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");

        if (!line || !line.startsWith("data:")) {
          continue;
        }

        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          yield {
            type: "end",
            responseId,
          } as const;
          return;
        }

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(payload) as Record<string, unknown>;
        } catch (error) {
          yield {
            type: "error",
            message: "Failed to parse local docker runner payload",
            cause: error,
          } as const;
          continue;
        }

        for (const notification of extractNotificationEvents(event)) {
          yield notification;
        }

        const type = event.type;
        switch (type) {
          case "response.created": {
            const createdResponse = event.response as { id?: string } | undefined;
            if (createdResponse?.id) {
              responseId = createdResponse.id;
            }
            break;
          }
          case "response.output_text.delta": {
            const delta = event.delta;
            if (typeof delta === "string") {
              yield { type: "delta", text: delta };
            } else if (
              delta &&
              typeof delta === "object" &&
              typeof (delta as { text?: unknown }).text === "string"
            ) {
              yield {
                type: "delta",
                text: (delta as { text: string }).text,
              };
            }
            break;
          }
          case "response.tool_call_arguments.delta": {
            const delta = event.delta as
              | { call_id?: string; arguments?: string; name?: string }
              | undefined;
            const callId = delta?.call_id ?? (event as { call_id?: string }).call_id;
            if (!callId) {
              break;
            }
            const buffer = ensureBuffer(callId);
            if (delta?.name) {
              buffer.name = delta.name;
            }
            if (typeof delta?.arguments === "string") {
              buffer.arguments += delta.arguments;
            }
            break;
          }
          case "response.tool_call_arguments.done": {
            const toolCall = event.tool_call as
              | { call_id?: string; name?: string; arguments?: string }
              | undefined;
            const callId =
              toolCall?.call_id ?? (event as { call_id?: string }).call_id;
            if (!callId) {
              break;
            }
            const emitted = flushToolCall(callId, {
              name: toolCall?.name,
              arguments: toolCall?.arguments,
            });
            if (emitted) {
              yield emitted;
            }
            break;
          }
          case "response.completed": {
            const completed = event.response as
              | { id?: string; status?: string; usage?: unknown }
              | undefined;
            responseId = completed?.id ?? responseId;
            const usage =
              completed?.usage && typeof completed.usage === "object"
                ? (completed.usage as Record<string, unknown>)
                : undefined;
            yield {
              type: "end",
              reason:
                typeof completed?.status === "string"
                  ? completed.status
                  : undefined,
              responseId,
              usage,
            } as const;
            return;
          }
          case "response.error": {
            const error = event.error as { message?: string } | undefined;
            yield {
              type: "error",
              message:
                error?.message ?? "Local docker runner returned an error",
              cause: error,
            } as const;
            break;
          }
          default:
            break;
        }
      }
    }
  }

  private resolveBaseUrl(): string {
    const baseUrl = this.config.baseUrl ?? DEFAULT_RUNNER_BASE_URL;
    return baseUrl.replace(/\/$/, "");
  }
}

@Injectable()
export class LocalDockerModelRunnerAdapterFactory
implements ProviderAdapterFactory
{
  readonly name = "local_docker";

  create(config: ProviderConfig): ProviderAdapter {
    return new LocalDockerModelRunnerAdapter(this.toAdapterConfig(config));
  }

  async listModels(config: ProviderConfig): Promise<string[]> {
    const adapterConfig = this.toAdapterConfig(config);
    const baseUrl = this.resolveBaseUrl(adapterConfig.baseUrl);
    const headers = createHeaders(adapterConfig);

    const response = await fetch(`${baseUrl}/v1/models`, {
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

  private toAdapterConfig(config: ProviderConfig): LocalDockerRunnerConfig {
    return {
      baseUrl:
        typeof config.baseUrl === "string" ? config.baseUrl : undefined,
      apiKey: typeof config.apiKey === "string" ? config.apiKey : undefined,
      headers:
        config.headers && typeof config.headers === "object"
          ? (config.headers as Record<string, string>)
          : undefined,
    };
  }

  private resolveBaseUrl(baseUrl?: string): string {
    return (baseUrl ?? DEFAULT_RUNNER_BASE_URL).replace(/\/$/, "");
  }
}
