import type {
  AgentInvocation,
  TranscriptCompactionPlan,
  TranscriptCompactionResult,
  TranscriptCompactor,
} from "./agent-orchestrator.service";

export class SummarizingTranscriptCompactor implements TranscriptCompactor {
  constructor(
    private readonly summarizer: (
      msgs: AgentInvocation["messages"]
    ) => Promise<string>,
    private readonly maxMessages = 600,
    private readonly windowSize = 250,
    private readonly label = "Summary of previous conversation"
  ) {}

  plan(
    invocation: AgentInvocation,
    _iteration: number
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

    const reason = `summarize ${take} oldest messages into 1 summary (limit ${this.maxMessages})`;

    return {
      reason,
      apply: async (): Promise<TranscriptCompactionResult> => {
        const slice = invocation.messages.slice(
          firstNonSystemIndex,
          firstNonSystemIndex + take
        );
        const summary = await this.summarizer(slice);

        invocation.messages.splice(firstNonSystemIndex, take, {
          role: "assistant",
          content: `${this.label}:\n\n${summary}`,
        });

        return { removedMessages: take - 1 };
      },
    };
  }
}
