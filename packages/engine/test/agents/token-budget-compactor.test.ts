import { describe, expect, it } from "vitest";
import { TokenBudgetCompactor } from "../../src/agents/token-budget-compactor";
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
});
