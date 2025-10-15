import type { ChatMessage } from "@eddie/types";
import type {
  SummarizerTranscriptCompactorConfig,
  TranscriptCompactionPlan,
  TranscriptCompactionResult,
  TranscriptCompactor,
  TranscriptCompactorFactory,
  TranscriptCompactorFactoryContext,
} from "./types";
import type { AgentInvocation } from "../agents/agent-invocation";
import { registerTranscriptCompactor } from "./registry";

export class SummarizingTranscriptCompactor implements TranscriptCompactor {
  constructor(
    private readonly summarizer: (msgs: ChatMessage[]) => Promise<string>,
    private readonly maxMessages = 600,
    private readonly windowSize = 250,
    private readonly label = "Summary of previous conversation"
  ) {}

  plan(
    invocation: AgentInvocation,
    iteration: number
  ): TranscriptCompactionPlan | null {
    const total = invocation.messages.length;
    if (total <= this.maxMessages) {
      return null;
    }

    const budget = total - Math.floor(this.maxMessages / 2);
    const windowLimit = Math.min(this.windowSize, budget);
    if (windowLimit <= 0) {
      return null;
    }

    const firstNonSystemIndex = invocation.messages.findIndex(
      (message) => message.role !== "system"
    );
    if (firstNonSystemIndex === -1) {
      return null;
    }

    const available = total - firstNonSystemIndex;
    const targetTake = Math.min(windowLimit, available);
    if (targetTake <= 0) {
      return null;
    }

    const { messages: windowMessages, lastNonSystemIndex } = this.collectWindow(
      invocation.messages,
      firstNonSystemIndex,
      targetTake
    );
    if (windowMessages.length === 0) {
      return null;
    }

    const reason = this.buildReason(windowMessages.length, iteration);

    return {
      reason,
      apply: async (): Promise<TranscriptCompactionResult> => {
        const preservedSystems = this.extractSystems(
          invocation.messages,
          firstNonSystemIndex,
          lastNonSystemIndex
        );
        const summary = await this.summarizer(windowMessages);

        invocation.messages.splice(
          firstNonSystemIndex,
          lastNonSystemIndex - firstNonSystemIndex + 1,
          ...preservedSystems,
          this.buildSummaryMessage(summary)
        );

        return { removedMessages: windowMessages.length - 1 };
      },
    };
  }

  private buildReason(take: number, iteration: number): string {
    return `summarize ${take} oldest messages into 1 summary (limit ${this.maxMessages}, iteration ${iteration})`;
  }

  private collectWindow(
    messages: ChatMessage[],
    startIndex: number,
    plannedTake: number
  ): { messages: ChatMessage[]; lastNonSystemIndex: number } {
    const collected: ChatMessage[] = [];
    let index = startIndex;
    let lastNonSystemIndex = startIndex - 1;

    while (index < messages.length && collected.length < plannedTake) {
      const message = messages[index];

      if (message.role !== "system") {
        collected.push(message);
        lastNonSystemIndex = index;
      }

      index += 1;
    }

    return { messages: collected, lastNonSystemIndex };
  }

  private extractSystems(
    messages: ChatMessage[],
    start: number,
    end: number
  ): ChatMessage[] {
    if (end < start) {
      return [];
    }

    return messages
      .slice(start, end + 1)
      .filter((message) => message.role === "system");
  }

  private buildSummaryMessage(summary: string): ChatMessage {
    return {
      role: "assistant",
      content: `${this.label}:\n\n${summary}`,
    };
  }
}

const factory: TranscriptCompactorFactory<SummarizerTranscriptCompactorConfig> = {
  strategy: "summarizer",
  create: (config, context) => {
    const maxMessages = resolvePositiveInteger(config.maxMessages, "maxMessages");
    const windowSize = resolvePositiveInteger(config.windowSize, "windowSize");
    const label = resolveLabel(config.label);
    const summarizer = createSummarizer(config.http, context);

    return new SummarizingTranscriptCompactor(
      summarizer,
      maxMessages,
      windowSize,
      label,
    );
  },
};

registerTranscriptCompactor(factory, { builtin: true });

export const SummarizingTranscriptCompactorStrategy = factory.strategy;

async function defaultSummarizer(messages: ChatMessage[]): Promise<string> {
  if (!messages.length) {
    return "";
  }

  const lines = messages
    .map((message) => {
      const content = (message.content ?? "").trim();
      if (!content) {
        return undefined;
      }
      const role =
        message.role === "assistant" || message.role === "user"
          ? message.role.charAt(0).toUpperCase() + message.role.slice(1)
          : message.role;
      return `${role}: ${content}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  if (lines.length === 0) {
    return "";
  }

  const preview = lines.slice(0, 4).join("\n");
  return lines.length > 4 ? `${preview}\n...` : preview;
}

function resolvePositiveInteger(
  value: number | undefined,
  field: "maxMessages" | "windowSize" | "timeoutMs",
): number | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Summarizer transcript compactor requires ${field} to be a positive number when provided.`);
  }
  return value;
}

function resolveLabel(label: string | undefined): string | undefined {
  if (typeof label !== "string") {
    return undefined;
  }
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createSummarizer(
  httpConfig: SummarizerTranscriptCompactorConfig["http"],
  context: TranscriptCompactorFactoryContext,
): (messages: ChatMessage[]) => Promise<string> {
  if (!httpConfig) {
    return defaultSummarizer;
  }

  const url = resolveUrl(httpConfig.url);
  const method = resolveMethod(httpConfig.method);
  const headers = resolveHeaders(httpConfig.headers);
  const timeoutMs = resolvePositiveInteger(httpConfig.timeoutMs, "timeoutMs");

  return async (messages: ChatMessage[]): Promise<string> => {
    const controller = typeof timeoutMs === "number" ? new AbortController() : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (typeof timeoutMs === "number") {
      timer = setTimeout(() => controller?.abort(), timeoutMs);
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          ...(headers ?? {}),
        },
        body: JSON.stringify(buildHttpSummaryRequest(messages, context.agentId)),
        signal: controller?.signal,
      });

      if (!response.ok) {
        const details = await readErrorDetails(response);
        throw new Error(
          `Summarizer HTTP endpoint ${url} responded with ${response.status} ${response.statusText}${details}`,
        );
      }

      const contentType = response.headers?.get?.("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        const summary = extractSummaryFromJson(data);
        if (typeof summary !== "string" || summary.trim().length === 0) {
          throw new Error(
            `Summarizer HTTP endpoint ${url} returned JSON without a usable summary string.`,
          );
        }
        return summary;
      }

      return await response.text();
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };
}

function buildHttpSummaryRequest(messages: ChatMessage[], agentId: string) {
  return { agentId, messages };
}

function resolveUrl(url: unknown): string {
  if (typeof url !== "string") {
    throw new Error("Summarizer transcript compactor requires http.url to be a string.");
  }

  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    throw new Error("Summarizer transcript compactor http.url must be an absolute HTTP(S) URL.");
  }

  return trimmed;
}

function resolveMethod(method: unknown): "POST" | "PUT" | "PATCH" {
  if (typeof method === "undefined") {
    return "POST";
  }

  if (typeof method !== "string") {
    throw new Error("Summarizer transcript compactor http.method must be a string when provided.");
  }

  const upper = method.toUpperCase();
  if (upper === "POST" || upper === "PUT" || upper === "PATCH") {
    return upper;
  }

  throw new Error("Summarizer transcript compactor http.method must be POST, PUT, or PATCH.");
}

function resolveHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== "string") {
      throw new Error(
        `Summarizer transcript compactor http.headers requires string values for header "${key}".`,
      );
    }
    resolved[key] = value;
  }

  return resolved;
}

async function readErrorDetails(response: globalThis.Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) {
      return "";
    }
    return `: ${text}`;
  } catch {
    return "";
  }
}

function extractSummaryFromJson(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["summary", "result", "content"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}
