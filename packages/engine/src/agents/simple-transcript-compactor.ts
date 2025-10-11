import type {
  AgentInvocation,
  TranscriptCompactionPlan,
  TranscriptCompactionResult,
  TranscriptCompactor,
} from "./agent-orchestrator.service";

/**
 * SimpleTranscriptCompactor
 *
 * Removes oldest messages so total message count does not exceed maxMessages.
 * Preserves system messages and the most recent keepLast messages.
 */
export class SimpleTranscriptCompactor implements TranscriptCompactor {
  constructor(private readonly maxMessages = 300, private readonly keepLast = 50) {}

  plan(invocation: AgentInvocation, _iteration: number): TranscriptCompactionPlan | null {
    const total = invocation.messages.length;
    if (total <= this.maxMessages) {
      return null;
    }

    const targetKeep = Math.max(this.keepLast, Math.floor(this.maxMessages / 3));
    const overLimit = total - this.maxMessages;
    const maxRemovable = Math.max(0, total - targetKeep);
    const removableCount = Math.min(overLimit, maxRemovable);

    if (removableCount <= 0) {
      return null;
    }

    return {
      reason: `truncate ${removableCount} oldest messages (limit ${this.maxMessages})`,
      apply: (): TranscriptCompactionResult => {
        const messages = invocation.messages;
        const removeOldestNonSystem = (): boolean => {
          const head = messages[0];
          if (head?.role === "system") {
            const nextIndex = messages.findIndex((message) => message.role !== "system");
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
}
