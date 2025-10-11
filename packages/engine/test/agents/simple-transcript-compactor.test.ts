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
});
