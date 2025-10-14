import { describe, expect, it, vi } from "vitest";

import { SimpleTranscriptCompactor } from "../../src/transcript-compactors/simple-transcript-compactor";
import type { AgentInvocation } from "../../src/agents/agent-invocation";

describe("SimpleTranscriptCompactor", () => {
  it("preserves system messages and keepLast items while removing oldest non-system entries without relying on shift", () => {
    const compactor = new SimpleTranscriptCompactor(6, 3);
    const messages = [
      { role: "user", content: "u0" },
      { role: "system", content: "s1" },
      { role: "assistant", content: "a0" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
    ];

    const shiftSpy = vi.fn(() => {
      throw new Error("shift should not be called");
    });

    (messages as (typeof messages) & { shift: typeof Array.prototype.shift }).shift = shiftSpy as never;

    const invocation = { messages } as unknown as AgentInvocation;
    const plan = compactor.plan(invocation, 0);
    expect(plan).not.toBeNull();

    const result = plan!.apply();

    expect(result).toEqual({ removedMessages: 2 });
    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: "system", content: "s1" },
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "u3" },
    ]);
    expect(shiftSpy).not.toHaveBeenCalled();
  });
});
