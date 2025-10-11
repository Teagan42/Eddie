import type { ChatMessage } from "@eddie/types";
import type {
  TranscriptCompactionPlan,
  TranscriptCompactionResult,
  TranscriptCompactor,
} from "./agent-orchestrator.service";
import type { AgentInvocation } from "./agent-invocation";

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
    const plannedTake = Math.min(this.windowSize, budget);
    if (plannedTake <= 0) {
      return null;
    }

    const firstNonSystemIndex = invocation.messages.findIndex(
      (message) => message.role !== "system"
    );
    if (firstNonSystemIndex === -1) {
      return null;
    }

    const available = total - firstNonSystemIndex;
    const take = Math.min(plannedTake, available);
    if (take <= 0) {
      return null;
    }

    const { messages: windowMessages, lastNonSystemIndex } = this.collectWindow(
      invocation.messages,
      firstNonSystemIndex,
      plannedTake
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
