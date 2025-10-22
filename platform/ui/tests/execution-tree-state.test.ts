import { describe, expect, it } from "vitest";

import { createEmptyExecutionTreeState } from "./execution-tree-state";

describe("execution tree state helpers", () => {
  it("exposes an empty execution tree baseline", () => {
    const state = createEmptyExecutionTreeState();

    expect(state.agentHierarchy).toEqual([]);
    expect(state.toolInvocations).toEqual([]);
    expect(state.contextBundles).toEqual([]);
  });
});
