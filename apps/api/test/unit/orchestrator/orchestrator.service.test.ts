import { describe, expect, it, vi } from "vitest";
import { OrchestratorMetadataService } from "../../../src/orchestrator/orchestrator.service";
import type { ExecutionTreeStateStore } from "../../../src/orchestrator/execution-tree-state.store";
import type { ExecutionTreeState } from "@eddie/types";
import { ToolCallStatusDto } from "../../../src/orchestrator/dto/orchestrator-metadata.dto";

describe("OrchestratorMetadataService", () => {
  it("returns cached execution tree state without hitting chat history", async () => {
    const sessionId = "session-cached";

    const cachedState: ExecutionTreeState = {
      agentHierarchy: [
        {
          id: "manager",
          name: "Manager",
          provider: "openai",
          model: "gpt-4o",
          depth: 0,
          lineage: [],
          children: [],
        },
      ],
      toolInvocations: [
        {
          id: "call-bash",
          agentId: "manager",
          name: "bash",
          status: "completed",
          createdAt: "2024-05-01T00:00:00.000Z",
          updatedAt: "2024-05-01T00:00:10.000Z",
          metadata: { preview: "ls" },
          children: [],
        },
      ],
      contextBundles: [
        {
          id: "bundle-history",
          label: "Session history",
          sizeBytes: 1024,
          fileCount: 0,
          summary: "1 messages captured",
          files: [],
          source: {
            type: "tool_result",
            agentId: "manager",
            toolCallId: "call-bash",
          },
        },
      ],
      agentLineageById: { manager: [] },
      toolGroupsByAgentId: {
        manager: {
          completed: [
            {
              id: "call-bash",
              agentId: "manager",
              name: "bash",
              status: "completed",
              createdAt: "2024-05-01T00:00:00.000Z",
              updatedAt: "2024-05-01T00:00:10.000Z",
              metadata: { preview: "ls" },
              children: [],
            },
          ],
          pending: [],
          running: [],
          failed: [],
        },
      },
      contextBundlesByAgentId: { manager: [] },
      contextBundlesByToolCallId: {},
      createdAt: "2024-05-01T00:00:00.000Z",
      updatedAt: "2024-05-01T00:00:10.000Z",
    };

    const store = {
      get: vi.fn().mockReturnValue(cachedState),
    } as unknown as ExecutionTreeStateStore;

    const service = new OrchestratorMetadataService(store);

    const metadata = await service.getMetadata(sessionId);

    expect(store.get).toHaveBeenCalledWith(sessionId);
    expect(metadata.sessionId).toBe(sessionId);
    expect(metadata.capturedAt).toBe(cachedState.updatedAt);
    expect(metadata.agentHierarchy).toHaveLength(1);
    const [manager] = metadata.agentHierarchy;
    expect(manager).toMatchObject({
      id: "manager",
      name: "Manager",
      provider: "openai",
      model: "gpt-4o",
      depth: 0,
    });

    expect(manager?.children).toHaveLength(0);

    expect(metadata.toolInvocations).toHaveLength(1);
    const [invocation] = metadata.toolInvocations;
    expect(invocation).toMatchObject({
      id: "call-bash",
      name: "bash",
      status: ToolCallStatusDto.Completed,
    });
    expect(invocation?.metadata).toMatchObject({
      preview: "ls",
      agentId: "manager",
      createdAt: "2024-05-01T00:00:00.000Z",
      updatedAt: "2024-05-01T00:00:10.000Z",
    });

    expect(metadata.contextBundles).toHaveLength(1);
    const [bundle] = metadata.contextBundles;
    expect(bundle).toMatchObject({
      id: "bundle-history",
      label: "Session history",
      summary: "1 messages captured",
      sizeBytes: 1024,
      fileCount: 0,
    });
  });
});
