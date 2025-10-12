import { describe, expect, it } from "vitest";
import type { PackedContext } from "@eddie/types";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type { AgentRuntimeDescriptor } from "../../src/agents/agent-runtime.types";
import { AgentRunner } from "../../src/agents/agent-runner";

describe("AgentRunner", () => {
  it("builds subagent results with cloned context and history metadata", () => {
    const childContext: PackedContext = {
      files: [
        { id: "file-1", path: "notes.txt", text: "remember this", bytes: 32 },
      ],
      text: "workspace",
      totalBytes: 32,
      resources: [
        {
          id: "bundle-123",
          type: "bundle",
          text: "bundle content",
          files: [
            { id: "bundle-file", path: "bundle.md", text: "docs", bytes: 10 },
          ],
        },
      ],
    };

    const childHistory = [
      { role: "user" as const, content: "Initial request" },
      { role: "assistant" as const, content: "Acknowledged" },
    ];

    const childInvocation = {
      context: childContext,
      history: childHistory,
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "Initial request" },
        { role: "assistant", content: " Completed successfully.  " },
      ],
    } as unknown as Pick<AgentInvocation, "context" | "history" | "messages">;

    const descriptor: AgentRuntimeDescriptor = {
      id: "child-agent",
      definition: { id: "child-agent", systemPrompt: "" },
      model: "gpt-child",
      provider: { name: "openai", stream: async function* () { /* noop */ } },
    };

    const parentDescriptor: AgentRuntimeDescriptor = {
      id: "parent-agent",
      definition: { id: "parent-agent", systemPrompt: "" },
      model: "gpt-parent",
      provider: { name: "openai", stream: async function* () { /* noop */ } },
    };

    const requestContext: PackedContext = {
      files: [],
      text: "override",
      totalBytes: 0,
      resources: [
        { id: "bundle-999", type: "bundle", text: "override" },
      ],
    };

    const result = AgentRunner.buildSubagentResult({
      child: childInvocation as AgentInvocation,
      descriptor,
      parentDescriptor,
      request: {
        prompt: "Handle the delegated task",
        variables: { priority: "high" },
        context: requestContext,
        metadata: { origin: "user-action" },
      },
    });

    expect(result.schema).toBe("eddie.tool.spawn_subagent.result.v1");
    expect(result.content).toBe("Completed successfully.");
    expect(result.data).toMatchObject({
      agentId: "child-agent",
      messageCount: 3,
      prompt: "Handle the delegated task",
      finalMessage: "Completed successfully.",
      variables: { priority: "high" },
      transcriptSummary:
        "User: Initial request | Assistant: Completed successfully.",
      historySnippet:
        "User: Initial request | Assistant: Completed successfully.",
    });
    expect(result.metadata).toMatchObject({
      agentId: "child-agent",
      parentAgentId: "parent-agent",
      contextBundleIds: ["bundle-123"],
      historySnippet:
        "User: Initial request | Assistant: Completed successfully.",
      transcriptSummary:
        "User: Initial request | Assistant: Completed successfully.",
      finalMessage: "Completed successfully.",
      request: { origin: "user-action" },
    });

    expect(result.data?.context).toEqual({
      files: childContext.files,
      text: childContext.text,
      totalBytes: childContext.totalBytes,
      resources: childContext.resources,
      selectedBundleIds: ["bundle-123"],
    });

    expect(result.data?.history).toEqual(childHistory);
    expect(result.data?.history).not.toBe(childHistory);
    expect(result.data?.context).not.toBe(childContext);

    childContext.files.push({
      id: "mutated",
      path: "mutated.txt",
      text: "mutated",
      bytes: 1,
    });
    childHistory.push({ role: "assistant", content: "mutated" });

    expect(result.data?.context?.files).toHaveLength(1);
    expect(result.data?.history).toHaveLength(2);
  });
});
