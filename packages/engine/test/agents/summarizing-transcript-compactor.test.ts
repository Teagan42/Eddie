import { describe, expect, it, vi } from "vitest";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import { SummarizingTranscriptCompactor } from "../../src/agents/summarizing-transcript-compactor";

describe("SummarizingTranscriptCompactor", () => {
  it("returns null plan when total messages do not exceed max", () => {
    const summarizer = vi.fn();
    const compactor = new SummarizingTranscriptCompactor(summarizer, 5, 3);

    const invocation = {
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    } as unknown as AgentInvocation;

    const plan = compactor.plan(invocation, 0);

    expect(plan).toBeNull();
    expect(summarizer).not.toHaveBeenCalled();
  });

  it("summarizes oldest non-system messages when exceeding max", async () => {
    const summarizer = vi.fn().mockResolvedValue("summarized content");
    const compactor = new SummarizingTranscriptCompactor(
      summarizer,
      6,
      3,
      "Conversation Summary"
    );

    const invocation = {
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
        { role: "assistant", content: "a2" },
        { role: "user", content: "u3" },
        { role: "assistant", content: "a3" },
        { role: "user", content: "u4" },
      ],
    } as unknown as AgentInvocation;

    const plan = compactor.plan(invocation, 0);

    expect(plan).not.toBeNull();
    expect(plan?.reason).toContain("summarize 3 oldest messages");
    expect(plan?.reason).toContain("iteration 0");

    const result = await plan!.apply();

    expect(summarizer).toHaveBeenCalledWith([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
    ]);
    expect(result).toEqual({ removedMessages: 2 });
    expect(invocation.messages).toEqual([
      { role: "system", content: "system" },
      {
        role: "assistant",
        content: "Conversation Summary:\n\nsummarized content",
      },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
      { role: "assistant", content: "a3" },
      { role: "user", content: "u4" },
    ]);
  });

  it("preserves inline system messages when summarizing oldest window", async () => {
    const summarizer = vi.fn().mockResolvedValue("summarized inline");
    const compactor = new SummarizingTranscriptCompactor(
      summarizer,
      6,
      3,
      "Conversation Summary"
    );

    const invocation = {
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "u1" },
        { role: "system", content: "inline system" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
        { role: "assistant", content: "a2" },
        { role: "user", content: "u3" },
      ],
    } as unknown as AgentInvocation;

    const plan = compactor.plan(invocation, 1);

    expect(plan).not.toBeNull();
    expect(plan?.reason).toContain("summarize 3 oldest messages");
    expect(plan?.reason).toContain("iteration 1");

    const result = await plan!.apply();

    expect(summarizer).toHaveBeenCalledWith([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
    ]);
    expect(result).toEqual({ removedMessages: 2 });
    expect(invocation.messages).toEqual([
      { role: "system", content: "system" },
      { role: "system", content: "inline system" },
      {
        role: "assistant",
        content: "Conversation Summary:\n\nsummarized inline",
      },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
    ]);
  });
});
