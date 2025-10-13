import { describe, expect, it } from "vitest";
import { TokenBudgetCompactor } from "../../src/transcript-compactors/token-budget-compactor";
import type { AgentInvocation } from "../../src/agents/agent-invocation";

const createInvocation = (messages: AgentInvocation["messages"]): AgentInvocation => ({
  messages,
} as unknown as AgentInvocation);

describe("TokenBudgetCompactor", () => {
  it("returns null plan when transcript tokens are within budget", async () => {
    const invocation = createInvocation([
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ]);
    const compactor = new TokenBudgetCompactor(20);

    const plan = await compactor.plan(invocation, 1);

    expect(plan).toBeNull();
  });

  it("trims further when summary stays above a tight budget", async () => {
    const longContent = "l".repeat(1200);
    const invocation = createInvocation([
      { role: "system", content: "Stay helpful." },
      { role: "user", content: longContent },
      { role: "assistant", content: "Acknowledged." },
      { role: "user", content: "tail question" },
      { role: "assistant", content: "tail answer" },
    ]);
    const summarize = () => "s".repeat(600);
    const compactor = new TokenBudgetCompactor(120, 2, summarize);

    const plan = await compactor.plan(invocation, 1);

    expect(plan).not.toBeNull();
    await plan?.apply();

    expect(estimateTokens(invocation.messages)).toBeLessThanOrEqual(120);
  });
});

const estimateTokens = (messages: AgentInvocation["messages"]): number => {
  let total = 0;
  for (const message of messages) {
    total += 4;
    total += Math.ceil((message.content ?? "").length / 4);
  }
  return total;
};
