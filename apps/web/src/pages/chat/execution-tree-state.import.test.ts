import { describe, expect, it } from "vitest";

describe("chat execution tree state bridge", () => {
  it("exposes execution tree state helpers", async () => {
    const module = await import("./execution-tree-state");

    expect(module.createExecutionTreeStateFromMetadata).toBeTypeOf("function");
    expect(module.createEmptyExecutionTreeState).toBeTypeOf("function");
    expect(module.composeExecutionTreeState).toBeTypeOf("function");
  });
});
