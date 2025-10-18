import { describe, expect, it } from "vitest";
import { ExecutionTreeStateStore } from "../../../src/orchestrator/execution-tree-state.store";
import type { ExecutionTreeState } from "@eddie/types";

function createState(): ExecutionTreeState {
  return {
    agentHierarchy: [],
    toolInvocations: [],
    contextBundles: [],
    agentLineageById: {},
    toolGroupsByAgentId: {},
    contextBundlesByAgentId: {},
    contextBundlesByToolCallId: {},
    createdAt: "2024-06-01T00:00:00.000Z",
  };
}

describe("ExecutionTreeStateStore", () => {
  it("tracks whether a session has cached state", () => {
    const store = new ExecutionTreeStateStore();
    const sessionId = "session-has-state";
    const state: ExecutionTreeState = createState();

    expect(store.has(sessionId)).toBe(false);

    store.set(sessionId, state);
    expect(store.has(sessionId)).toBe(true);

    store.clear(sessionId);
    expect(store.has(sessionId)).toBe(false);
  });
});
