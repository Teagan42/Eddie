import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@eddie/types";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import { IntelligentTranscriptCompactor } from "../../src/transcript-compactors/intelligent-transcript-compactor";

const message = (role: ChatMessage["role"], content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  role,
  content,
  ...extra,
});

describe("IntelligentTranscriptCompactor", () => {
  const buildInvocation = (
    id: string,
    messages: ChatMessage[],
    parent?: AgentInvocation
  ): AgentInvocation => ({
    definition: { id, systemPrompt: "system" },
    messages: [...messages],
    parent,
  }) as unknown as AgentInvocation;

  it("injects parent context when child agent requires it", async () => {
    const compactor = new IntelligentTranscriptCompactor({
      minMessagesBeforeCompaction: 1,
      enableParentContextStorage: true,
    });

    const parentMessages = [
      message("system", "router system"),
      message(
        "assistant",
        "Plan:\n1. coordinate\n2. review\n\nDecided to delegate the refactor"
      ),
      message("assistant", "Found bug in module A"),
    ];
    const parentInvocation = buildInvocation("router", parentMessages);

    const childMessages = [
      message("system", "red system"),
      message("user", "Implement feature"),
      message("assistant", "tool_call:123", { tool_call_id: "123" }),
      message("tool", "tool result", { tool_call_id: "123", name: "fs" }),
      message("assistant", "Ready for next step"),
    ];
    const childInvocation = buildInvocation("red-impl", childMessages, parentInvocation);

    const parentPlan = await compactor.plan(parentInvocation, 1);
    expect(parentPlan).not.toBeNull();
    parentPlan!.apply();

    const childPlan = await compactor.plan(childInvocation, 1);
    expect(childPlan).not.toBeNull();

    childPlan!.apply();

    expect(childInvocation.messages[1]?.role).toBe("system");
    expect(childInvocation.messages[1]?.content).toContain("Task Plan");
    expect(childInvocation.messages[1]?.content).toContain("Key Decisions");
    expect(childInvocation.messages[1]?.content).toContain("Important Findings");

    const toolCallIndex = childInvocation.messages.findIndex(
      (msg) => msg.role === "assistant" && msg.content.includes("tool_call")
    );
    expect(toolCallIndex).toBeGreaterThan(-1);
    expect(childInvocation.messages[toolCallIndex + 1]?.role).toBe("tool");
    expect(childInvocation.messages.length).toBeLessThan(childMessages.length);
  });
});
