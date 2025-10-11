import type { AgentInvocation } from "./agent-invocation";
import type {
  TranscriptCompactor,
  TranscriptCompactionPlan,
  TranscriptCompactionResult,
} from "./agent-orchestrator.service";
import type { ChatMessage } from "@eddie/types";

const DEFAULT_HARD_FLOOR = 2048;

export type SummarizeFn = (
  messages: ChatMessage[]
) => Promise<string> | string;

export class TokenBudgetCompactor implements TranscriptCompactor {
  private readonly hardFloor: number;

  constructor(
    private readonly tokenBudget: number,
    private readonly keepTail: number = 6,
    private readonly summarize: SummarizeFn = naiveSummarize,
    hardFloor: number = DEFAULT_HARD_FLOOR
  ) {
    this.hardFloor = resolveHardFloor(this.tokenBudget, hardFloor);
  }

  async plan(
    invocation: AgentInvocation,
    iteration: number
  ): Promise<TranscriptCompactionPlan | null> {
    const tokens = estimateTokens(invocation.messages);
    if (tokens <= this.tokenBudget) {
      return null;
    }

    const reason = `history tokens ${tokens} exceeded budget ${this.tokenBudget} on iteration ${iteration}`;
    return {
      reason,
      apply: async (): Promise<TranscriptCompactionResult> => {
        const before = invocation.messages.length;
        await compactInPlace(
          invocation,
          this.tokenBudget,
          this.keepTail,
          this.summarize,
          this.hardFloor
        );
        const after = invocation.messages.length;
        return { removedMessages: Math.max(0, before - after) };
      },
    };
  }
}

/* ---------------- helpers ---------------- */

function estimateTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += 4;
    total += Math.ceil((message.content ?? "").length / 4);
  }
  return total;
}

async function compactInPlace(
  invocation: AgentInvocation,
  budget: number,
  keepTail: number,
  summarize: SummarizeFn,
  hardFloor: number
): Promise<void> {
  const systemMessages = invocation.messages.filter(
    (message) => message.role === "system"
  );
  const otherMessages = invocation.messages.filter(
    (message) => message.role !== "system"
  );

  const tail = takeTailWithToolPairs(otherMessages, keepTail);
  const head = otherMessages.slice(0, otherMessages.length - tail.length);

  for (const message of head) {
    if (
      message.role === "tool" &&
      message.content &&
      message.content.length > 800
    ) {
      const bytes = byteLength(message.content);
      message.content = `[tool:${message.name ?? "unnamed"} ${bytesToHuman(bytes)} omitted]`;
    }
  }

  let assembled = [...systemMessages, ...head, ...tail];

  if (estimateTokens(assembled) > budget) {
    const rawSummary = await summarize(head);
    const summaryText = stripMarkdown(rawSummary ?? "");
    const summaryMessage: ChatMessage = {
      role: "assistant",
      content:
        summaryText.trim().length > 0
          ? `Summary of earlier context:\n${summaryText}`
          : `[summary omitted: previous context retained only as tail window]`,
    };
    assembled = [...systemMessages, summaryMessage, ...tail];
  }

  const assembledTokens = estimateTokens(assembled);
  const floorOverridesBudget = budget < hardFloor;
  if (assembledTokens <= budget || floorOverridesBudget) {
    invocation.messages.splice(0, invocation.messages.length, ...assembled);
    return;
  }

  const minimal = [...systemMessages, ...tail];
  invocation.messages.splice(0, invocation.messages.length, ...minimal);
}

function takeTailWithToolPairs(
  messages: ChatMessage[],
  keepTail: number
): ChatMessage[] {
  const tail: ChatMessage[] = [];
  const seen = new Set<ChatMessage>();

  const include = (message: ChatMessage): void => {
    if (seen.has(message)) {
      return;
    }
    tail.unshift(message);
    seen.add(message);
  };
  let index = messages.length - 1;

  while (index >= 0 && tail.length < keepTail) {
    const message = messages[index];
    include(message);

    if (message.role === "assistant" && message.tool_call_id) {
      const match = findLast(
        messages,
        (candidate) =>
          candidate.role === "tool" &&
          candidate.tool_call_id === message.tool_call_id,
        index - 1
      );
      if (match) {
        include(match);
      }
    }

    if (message.role === "tool" && message.tool_call_id) {
      const match = findLast(
        messages,
        (candidate) =>
          candidate.role === "assistant" &&
          candidate.tool_call_id === message.tool_call_id,
        index - 1
      );
      if (match) {
        include(match);
      }
    }

    index -= 1;
  }

  return tail;
}

function findLast<T>(
  items: T[],
  predicate: (item: T) => boolean,
  startIndex: number
): T | undefined {
  for (let index = startIndex; index >= 0; index -= 1) {
    const candidate = items[index];
    if (predicate(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function byteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}

function bytesToHuman(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripMarkdown(value: string): string {
  return value.replace(/[#*_`>-]+/g, "").trim();
}

function naiveSummarize(messages: ChatMessage[]): string {
  const lines: string[] = [];

  for (const message of messages) {
    if (!message.content) {
      continue;
    }
    if (message.role === "tool") {
      continue;
    }
    const text = message.content.replace(/\s+/g, " ").trim();
    if (text.length === 0) {
      continue;
    }
    lines.push(
      `- ${message.role}: ${text.slice(0, 240)}${text.length > 240 ? "…" : ""}`
    );
    if (lines.length >= 10) {
      break;
    }
  }

  return lines.join("\n");
}

function resolveHardFloor(tokenBudget: number, requestedFloor: number): number {
  if (requestedFloor !== DEFAULT_HARD_FLOOR) {
    return requestedFloor;
  }
  return Math.min(requestedFloor, tokenBudget);
}
