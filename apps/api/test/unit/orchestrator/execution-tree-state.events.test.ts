import { describe, expect, it } from "vitest";
import { ExecutionTreeStateUpdatedEvent, type ExecutionTreeState } from "@eddie/types";
import { ExecutionTreeStateStore } from "../../../src/orchestrator/execution-tree-state.store";
import { OrchestratorMetadataService } from "../../../src/orchestrator/orchestrator.service";
import { OrchestratorController } from "../../../src/orchestrator/orchestrator.controller";
import { ExecutionTreeStateUpdatedEventsHandler } from "../../../src/orchestrator/execution-tree-state.events-handler";
import { ToolCallStatusDto } from "../../../src/orchestrator/dto/orchestrator-metadata.dto";

function createState(): ExecutionTreeState {
  return {
    agentHierarchy: [
      {
        id: "manager",
        name: "Manager",
        provider: "openai",
        model: "gpt-4o",
        depth: 0,
        lineage: [],
        children: [
          {
            id: "writer",
            name: "Writer",
            provider: "anthropic",
            model: "claude-3",
            depth: 1,
            lineage: ["manager"],
            children: [],
          },
        ],
      },
    ],
    toolInvocations: [
      {
        id: "call-write",
        agentId: "writer",
        name: "write",
        status: "running",
        createdAt: "2024-05-01T02:00:00.000Z",
        updatedAt: "2024-05-01T02:00:05.000Z",
        metadata: { agentId: "writer" },
        children: [],
      },
    ],
    contextBundles: [
      {
        id: "bundle-ctx",
        label: "Research notes",
        summary: "Key points",
        sizeBytes: 2048,
        fileCount: 2,
        files: [],
        source: {
          type: "tool_call",
          agentId: "writer",
          toolCallId: "call-write",
        },
      },
    ],
    agentLineageById: {
      manager: [],
      writer: ["manager"],
    },
    toolGroupsByAgentId: {
      writer: {
        pending: [],
        running: [
          {
            id: "call-write",
            agentId: "writer",
            name: "write",
            status: "running",
            createdAt: "2024-05-01T02:00:00.000Z",
            updatedAt: "2024-05-01T02:00:05.000Z",
            metadata: { agentId: "writer" },
            children: [],
          },
        ],
        completed: [],
        failed: [],
      },
    },
    contextBundlesByAgentId: {
      writer: [],
    },
    contextBundlesByToolCallId: {
      "call-write": [],
    },
    createdAt: "2024-05-01T02:00:00.000Z",
    updatedAt: "2024-05-01T02:00:05.000Z",
  };
}

describe("ExecutionTreeStateUpdatedEventsHandler", () => {
  it("persists execution tree updates and exposes them through HTTP metadata", async () => {
    const sessionId = "session-events";
    const store = new ExecutionTreeStateStore();
    const handler = new ExecutionTreeStateUpdatedEventsHandler(store);
    const service = new OrchestratorMetadataService(store);
    const controller = new OrchestratorController(service);

    const event = new ExecutionTreeStateUpdatedEvent(sessionId, createState());

    await handler.handle(event);

    expect(store.get(sessionId)).toEqual(event.state);

    const metadata = await controller.getMetadata(sessionId);

    expect(metadata.sessionId).toBe(sessionId);
    expect(metadata.capturedAt).toBe(event.state.updatedAt);
    expect(metadata.agentHierarchy).toHaveLength(1);
    const [manager] = metadata.agentHierarchy;
    expect(manager).toMatchObject({
      id: "manager",
      name: "Manager",
      provider: "openai",
      model: "gpt-4o",
      depth: 0,
    });

    expect(manager?.children).toHaveLength(1);
    const [writer] = manager?.children ?? [];
    expect(writer).toMatchObject({
      id: "writer",
      name: "Writer",
      provider: "anthropic",
      model: "claude-3",
      depth: 1,
    });
    expect(writer?.metadata?.lineage).toEqual(["manager"]);

    expect(metadata.toolInvocations).toHaveLength(1);
    const [toolInvocation] = metadata.toolInvocations;
    expect(toolInvocation).toMatchObject({
      id: "call-write",
      name: "write",
      status: ToolCallStatusDto.Running,
    });
    expect(toolInvocation?.metadata).toMatchObject({
      agentId: "writer",
      createdAt: "2024-05-01T02:00:00.000Z",
      updatedAt: "2024-05-01T02:00:05.000Z",
    });

    expect(metadata.contextBundles).toHaveLength(1);
    const [bundle] = metadata.contextBundles;
    expect(bundle).toMatchObject({
      id: "bundle-ctx",
      label: "Research notes",
      summary: "Key points",
      sizeBytes: 2048,
      fileCount: 2,
    });
  });
});
