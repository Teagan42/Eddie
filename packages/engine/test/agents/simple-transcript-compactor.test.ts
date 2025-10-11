import { describe, expect, it } from "vitest";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type { ChatMessage } from "@eddie/types";
import { SimpleTranscriptCompactor } from "../../src/agents/simple-transcript-compactor";

describe("SimpleTranscriptCompactor", () => {
  const buildInvocation = (messages: ChatMessage[]): AgentInvocation => ({
    messages: [...messages],
  }) as unknown as AgentInvocation;

  const message = (role: ChatMessage["role"], content: string): ChatMessage => ({
    role,
    content,
  });

  it("returns null when message count is within max", () => {
    const compactor = new SimpleTranscriptCompactor(3, 1);
    const invocation = buildInvocation([
      message("system", "system"),
      message("user", "hello"),
      message("assistant", "world"),
    ]);

    const plan = compactor.plan(invocation, 0);

    expect(plan).toBeNull();
  });

  it("compacts when keepLast exceeds the max message limit", () => {
    const compactor = new SimpleTranscriptCompactor(5, 10);
    const invocation = buildInvocation([
      message("system", "system"),
      message("user", "m1"),
      message("assistant", "m2"),
      message("user", "m3"),
      message("assistant", "m4"),
      message("user", "m5"),
      message("assistant", "m6"),
      message("user", "m7"),
    ]);

    const plan = compactor.plan(invocation, 0);

    expect(plan).not.toBeNull();
    const result = plan!.apply();

    expect(result).toEqual({ removedMessages: 3 });
    expect(invocation.messages).toHaveLength(5);
    expect(invocation.messages[0]?.role).toBe("system");
    expect(invocation.messages.slice(1).map((msg) => msg.content)).toEqual([
      "m4",
      "m5",
      "m6",
      "m7",
    ]);
  });
});
