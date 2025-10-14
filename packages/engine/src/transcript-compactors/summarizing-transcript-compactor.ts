import type { ChatMessage } from "@eddie/types";
import type {
  SummarizerTranscriptCompactorConfig,
  TranscriptCompactionPlan,
  TranscriptCompactionResult,
  TranscriptCompactor,
  TranscriptCompactorFactory,
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
  create: (config) => {
    const maxMessages = resolvePositiveInteger(config.maxMessages, "maxMessages");
    const windowSize = resolvePositiveInteger(config.windowSize, "windowSize");
    const label = resolveLabel(config.label);

    return new SummarizingTranscriptCompactor(
      defaultSummarizer,
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
  field: "maxMessages" | "windowSize",
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
