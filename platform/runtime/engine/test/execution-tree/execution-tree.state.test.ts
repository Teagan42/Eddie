import { describe, expect, it } from "vitest";

import { ExecutionTreeState } from "../../src/execution-tree/execution-tree.state";

describe("ExecutionTreeState", () => {
  it("captures agent lineage when child agents are registered", () => {
    const state = new ExecutionTreeState();

    state.registerAgent({
      id: "root",
      name: "Manager",
      provider: "openai",
      model: "gpt-4o",
    });

    state.registerAgent({
      id: "worker",
      name: "Worker",
      parentId: "root",
    });

    const snapshot = state.getSnapshot();

    expect(snapshot.agentHierarchy).toEqual([
      {
        id: "root",
        name: "Manager",
        provider: "openai",
        model: "gpt-4o",
        depth: 0,
        lineage: ["root"],
        children: [
          {
            id: "worker",
            name: "Worker",
            depth: 1,
            lineage: ["root", "worker"],
            children: [],
          },
        ],
      },
    ]);
  });

  it("groups tool invocations by status for each agent", () => {
    const state = new ExecutionTreeState();

    state.registerAgent({
      id: "root",
      name: "Manager",
    });

    state.recordToolInvocation({
      id: "call-1",
      agentId: "root",
      name: "list_files",
      status: "pending",
    });

    state.recordToolInvocation({
      id: "call-2",
      agentId: "root",
      name: "list_files",
      status: "running",
    });

    state.recordToolInvocation({
      id: "call-3",
      agentId: "root",
      name: "commit",
      status: "completed",
    });

    state.recordToolInvocation({
      id: "call-4",
      agentId: "root",
      name: "commit",
      status: "failed",
    });

    const groups = state.getToolStatusGroups("root");

    expect(groups.get("pending")).toEqual([
      expect.objectContaining({ id: "call-1", status: "pending" }),
    ]);
    expect(groups.get("running")).toEqual([
      expect.objectContaining({ id: "call-2", status: "running" }),
    ]);
    expect(groups.get("completed")).toEqual([
      expect.objectContaining({ id: "call-3", status: "completed" }),
    ]);
    expect(groups.get("failed")).toEqual([
      expect.objectContaining({ id: "call-4", status: "failed" }),
    ]);

    const snapshot = state.getSnapshot();
    expect(snapshot.toolInvocations).toHaveLength(4);
  });

  it("captures context bundle updates for tool lifecycle events", () => {
    const state = new ExecutionTreeState();

    state.registerAgent({
      id: "root",
      name: "Manager",
    });

    state.recordToolInvocation({
      id: "call-1",
      agentId: "root",
      name: "spawn_subagent",
      status: "pending",
    });

    state.recordContextBundleUpdate({
      id: "bundle-call",
      label: "Call payload",
      sizeBytes: 128,
      fileCount: 1,
      agentId: "root",
      toolCallId: "call-1",
      sourceType: "tool_call",
    });

    state.recordToolInvocation({
      id: "call-1",
      agentId: "root",
      name: "spawn_subagent",
      status: "completed",
      metadata: { result: "ok" },
    });

    state.recordContextBundleUpdate({
      id: "bundle-result",
      label: "Result artifacts",
      sizeBytes: 64,
      fileCount: 0,
      summary: "Delegation succeeded",
      agentId: "root",
      toolCallId: "call-1",
      sourceType: "tool_result",
    });

    state.recordSpawnSubagent({
      toolCallId: "call-1",
      agentId: "root",
      spawnedAgentId: "worker",
      name: "Worker",
      provider: "openai",
      model: "gpt-4o-mini",
      contextBundle: {
        id: "bundle-spawn",
        label: "Spawn metadata",
        sizeBytes: 32,
        fileCount: 0,
        summary: "Subagent ready",
      },
    });

    const snapshot = state.getSnapshot();

    expect(snapshot.contextBundles.map((bundle) => bundle.id)).toEqual([
      "bundle-call",
      "bundle-result",
      "bundle-spawn",
    ]);

    expect(snapshot.contextBundles.map((bundle) => bundle.source.type)).toEqual([
      "tool_call",
      "tool_result",
      "spawn_subagent",
    ]);

    const spawnBundle = snapshot.contextBundles.find(
      (bundle) => bundle.id === "bundle-spawn"
    );
    expect(spawnBundle?.source).toEqual({
      type: "spawn_subagent",
      agentId: "root",
      toolCallId: "call-1",
    });

    const invocation = snapshot.toolInvocations.find(
      (node) => node.id === "call-1"
    );
    expect(invocation?.status).toBe("completed");
    expect(invocation?.metadata).toMatchObject({
      result: "ok",
      spawn: {
        agentId: "worker",
        name: "Worker",
        provider: "openai",
        model: "gpt-4o-mini",
      },
    });
  });
});
