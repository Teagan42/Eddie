import type {
  TranscriptCompactionPlan,
  TranscriptCompactionResult,
  TranscriptCompactor,
} from "./agent-orchestrator.service";
import type { AgentInvocation } from "./agent-invocation";

type InvocationMessage = AgentInvocation["messages"][number];

/**
 * SimpleTranscriptCompactor
 *
 * Removes oldest messages so total message count does not exceed maxMessages.
 * Preserves system messages and the most recent keepLast messages.
 */
export class SimpleTranscriptCompactor implements TranscriptCompactor {
  constructor(private readonly maxMessages = 300, private readonly keepLast = 50) {}

  plan(invocation: AgentInvocation, iteration: number): TranscriptCompactionPlan | null {
    const total = invocation.messages.length;
    if (total <= this.maxMessages) {
      return null;
    }

    const targetKeep = this.computeTargetKeep();
    const overLimit = total - this.maxMessages;
    const maxRemovable = Math.max(0, total - targetKeep);
    const removableCount = Math.min(overLimit, maxRemovable);

    if (removableCount <= 0) {
      return null;
    }

    if (!this.hasRemovableNonSystem(invocation.messages)) {
      return null;
    }

    const reason = this.describeCompaction(removableCount, iteration);

    return {
      reason,
      apply: (): TranscriptCompactionResult => {
        const messages = invocation.messages;
        const removeOldestNonSystem = (): boolean => {
          const head = messages[0];
          if (head?.role === "system") {
            const nextIndex = messages.findIndex(
              (message: InvocationMessage) => message.role !== "system"
            );
            if (nextIndex === -1) {
              return false;
            }
            messages.splice(nextIndex, 1);
            return true;
          }

          messages.shift();
          return true;
        };

        let removed = 0;
        while (removed < removableCount && messages.length > targetKeep) {
          const removedMessage = removeOldestNonSystem();
          if (!removedMessage) {
            break;
          }
          removed += 1;
        }

        return { removedMessages: removed };
      },
    };
  }

  private computeTargetKeep(): number {
    return Math.min(
      this.maxMessages,
      Math.max(this.keepLast, Math.floor(this.maxMessages / 3))
    );
  }

  private hasRemovableNonSystem(messages: InvocationMessage[]): boolean {
    return messages.some(
      (message: InvocationMessage) => message.role !== "system"
    );
  }

  private describeCompaction(removableCount: number, iteration: number): string {
    return `truncate ${removableCount} oldest messages (limit ${this.maxMessages}; iteration ${iteration})`;
  }
}
