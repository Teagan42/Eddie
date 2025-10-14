import type {
  SimpleTranscriptCompactorConfig,
  TranscriptCompactionPlan,
  TranscriptCompactionResult,
  TranscriptCompactor,
  TranscriptCompactorFactory,
} from "./types";
import type { AgentInvocation } from "../agents/agent-invocation";
import { registerTranscriptCompactor } from "./registry";

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
        const advanceToNextNonSystem = (startIndex: number): number => {
          let index = startIndex;
          while (index < messages.length && messages[index]?.role === "system") {
            index += 1;
          }
          return index;
        };

        let removed = 0;
        let searchIndex = 0;
        while (removed < removableCount && messages.length > targetKeep) {
          searchIndex = advanceToNextNonSystem(searchIndex);

          if (searchIndex >= messages.length) {
            break;
          }

          const remainingRemovals = Math.min(
            removableCount - removed,
            messages.length - targetKeep,
          );

          if (remainingRemovals <= 0) {
            break;
          }

          const sliceLimit = Math.min(messages.length, searchIndex + remainingRemovals);
          let sliceEnd = searchIndex;
          while (sliceEnd < sliceLimit && messages[sliceEnd]?.role !== "system") {
            sliceEnd += 1;
          }

          if (sliceEnd === searchIndex) {
            searchIndex += 1;
            continue;
          }

          const deleteCount = sliceEnd - searchIndex;
          messages.splice(searchIndex, deleteCount);
          removed += deleteCount;
        }

        return { removedMessages: removed };
      },
    };
  }

  private computeTargetKeep(): number {
    return Math.min(
      this.maxMessages,
      Math.max(this.keepLast, Math.floor(this.maxMessages / 3)),
    );
  }

  private hasRemovableNonSystem(messages: InvocationMessage[]): boolean {
    return messages.some((message: InvocationMessage) => message.role !== "system");
  }

  private describeCompaction(removableCount: number, iteration: number): string {
    return `truncate ${removableCount} oldest messages (limit ${this.maxMessages}; iteration ${iteration})`;
  }
}

const factory: TranscriptCompactorFactory<SimpleTranscriptCompactorConfig> = {
  strategy: "simple",
  create: (config) =>
    new SimpleTranscriptCompactor(
      typeof config.maxMessages === "number" ? config.maxMessages : undefined,
      typeof config.keepLast === "number" ? config.keepLast : undefined,
    ),
};

registerTranscriptCompactor(factory, { builtin: true });

export const SimpleTranscriptCompactorStrategy = factory.strategy;
