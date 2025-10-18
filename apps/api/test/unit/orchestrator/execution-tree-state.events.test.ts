import { afterEach, describe, expect, it } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { CqrsModule, EventBus } from "@nestjs/cqrs";
import {
  ExecutionTreeStateUpdatedEvent,
  type ExecutionTreeState,
} from "@eddie/types";
import { ExecutionTreeStateStore } from "../../../src/orchestrator/execution-tree-state.store";

let moduleRef: TestingModule | null = null;

describe("ExecutionTreeStateStore event subscription", () => {
  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
      moduleRef = null;
    }
  });

  it("updates the cache when execution tree events are published", async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CqrsModule.forRoot({})],
      providers: [ExecutionTreeStateStore],
    }).compile();
    await moduleRef.init();

    const store = moduleRef.get(ExecutionTreeStateStore);
    const eventBus = moduleRef.get(EventBus);
    const state = createExecutionTreeState();

    eventBus.publish(new ExecutionTreeStateUpdatedEvent("session-42", state));
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(store.get("session-42")).toEqual(state);
  });
});

function createExecutionTreeState(): ExecutionTreeState {
  return {
    agentHierarchy: [],
    toolInvocations: [],
    contextBundles: [],
    agentLineageById: {},
    toolGroupsByAgentId: {},
    contextBundlesByAgentId: {},
    contextBundlesByToolCallId: {},
    createdAt: "2024-04-01T00:00:00.000Z",
    updatedAt: "2024-04-01T00:00:00.000Z",
  } satisfies ExecutionTreeState;
}
