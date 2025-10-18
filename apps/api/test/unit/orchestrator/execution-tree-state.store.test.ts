import { describe, expect, it } from "vitest";
import {
  ExecutionTreeStateUpdatedEvent,
  type ExecutionTreeState,
} from "@eddie/types";
import { ExecutionTreeStateStore } from "../../../src/orchestrator/execution-tree-state.store";

describe("ExecutionTreeStateStore", () => {
  it("returns the latest execution tree state for a session", () => {
    const store = new ExecutionTreeStateStore();
    const sessionId = "session-123";

    const firstState = createExecutionTreeState("2024-01-01T00:00:00.000Z");
    const secondState = createExecutionTreeState("2024-01-01T00:05:00.000Z");

    store.handle(new ExecutionTreeStateUpdatedEvent(sessionId, firstState));
    store.handle(new ExecutionTreeStateUpdatedEvent(sessionId, secondState));

    expect(store.get(sessionId)).toBe(secondState);
  });

  it("returns undefined when no state has been recorded for a session", () => {
    const store = new ExecutionTreeStateStore();

    expect(store.get("unknown-session")).toBeUndefined();
  });
});

function createExecutionTreeState(timestamp: string): ExecutionTreeState {
  return {
    agentHierarchy: [],
    toolInvocations: [],
    contextBundles: [],
    agentLineageById: {},
    toolGroupsByAgentId: {},
    contextBundlesByAgentId: {},
    contextBundlesByToolCallId: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies ExecutionTreeState;
}
