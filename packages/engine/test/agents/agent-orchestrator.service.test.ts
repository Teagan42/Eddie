import { describe, expect, it, vi } from "vitest";
import type { StreamEvent, ToolResult } from "@eddie/types";
import { AgentOrchestratorService } from "../../src/agents/agent-orchestrator.service";
import { AgentRunner } from "../../src/agents/agent-runner";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type {
  AgentRuntimeCatalog,
  AgentRuntimeDescriptor,
} from "../../src/agents/agent-runtime.types";

const createStream = (events: StreamEvent[]): AsyncIterable<StreamEvent> => ({
  [Symbol.asyncIterator]: async function* () {
    for (const event of events) {
      yield event;
    }
  },
});

describe("AgentOrchestratorService", () => {
  it("threads previous response ids into subsequent provider calls", async () => {
    const agentDefinition = {
      id: "agent-1",
      systemPrompt: "You are helpful.",
      tools: [],
    };

    const invocation = {
      definition: agentDefinition,
      prompt: "List files",
      context: { files: [], totalBytes: 0, text: "" },
      history: [],
      messages: [
        { role: "system", content: agentDefinition.systemPrompt },
        { role: "user", content: "List files" },
      ],
      children: [],
      parent: undefined,
      toolRegistry: {
        schemas: () => [],
        execute: vi.fn().mockResolvedValue({ schema: "tool", content: "done" }),
      },
      setSpawnHandler: vi.fn(),
      addChild: vi.fn(),
      spawn: vi.fn(),
      id: agentDefinition.id,
      isRoot: true,
    } as unknown as AgentInvocation;

    const firstStreamEvents: StreamEvent[] = [
      {
        type: "tool_call",
        id: "call_1",
        name: "bash",
        arguments: {},
      },
      { type: "end", responseId: "resp_first" },
    ];

    const secondStreamEvents: StreamEvent[] = [
      { type: "delta", text: "Done" },
      { type: "end", responseId: "resp_second" },
    ];

    const providerStream = vi
      .fn()
      .mockReturnValueOnce(createStream(firstStreamEvents))
      .mockReturnValueOnce(createStream(secondStreamEvents));

    const descriptor: AgentRuntimeDescriptor = {
      id: agentDefinition.id,
      definition: agentDefinition,
      model: "gpt-test",
      provider: {
        name: "openai",
        stream: providerStream,
      },
    };

    const catalog: AgentRuntimeCatalog = {
      enableSubagents: false,
      getManager: () => descriptor,
      getAgent: () => descriptor,
      getSubagent: () => undefined,
      listSubagents: () => [],
    };

    const runtime = {
      catalog,
      hooks: { emitAsync: vi.fn().mockResolvedValue({}) },
      confirm: vi.fn().mockResolvedValue(true),
      cwd: process.cwd(),
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
      traceAppend: true,
      tracePath: undefined,
    };

    const invocationFactory = {
      create: vi.fn().mockResolvedValue(invocation),
    };

    const streamRenderer = {
      render: vi.fn(),
      flush: vi.fn(),
    };

    const traceWriter = {
      write: vi.fn(),
    };

    const orchestrator = new AgentOrchestratorService(
      invocationFactory as any,
      streamRenderer as any,
      traceWriter as any,
    );

    const runSpy = vi.spyOn(AgentRunner.prototype as Record<string, unknown>, "run");

    await orchestrator.runAgent(
      { definition: agentDefinition, prompt: "List files" },
      runtime as any,
    );

    expect(providerStream).toHaveBeenCalledTimes(2);
    expect(providerStream.mock.calls[1]?.[0]).toMatchObject({
      previousResponseId: "resp_first",
    });
    expect(runSpy).toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it("returns spawn tool summaries with transcript snippet and context metadata", async () => {
    const agentDefinition = {
      id: "agent-1",
      systemPrompt: "You are helpful.",
      tools: [],
    };

    const subagentDefinition = {
      id: "subagent-1",
      systemPrompt: "Assist with delegated work.",
      tools: [],
    };

    const childInvocation = {
      definition: subagentDefinition,
      prompt: "Handle the delegated task",
      context: {
        files: [],
        totalBytes: 0,
        text: "",
        resources: [
          { id: "bundle-123", type: "bundle", text: "" },
          { id: "template-42", type: "template", text: "" },
        ],
      },
      history: [
        { role: "user", content: "Please help with the delegated task." },
      ],
      messages: [
        { role: "system", content: subagentDefinition.systemPrompt },
        { role: "user", content: "   Please help with the delegated task.   " },
        { role: "assistant", content: "  Completed successfully.  " },
      ],
      children: [],
      toolRegistry: { schemas: () => [], execute: vi.fn() },
      setSpawnHandler: vi.fn(),
      addChild: vi.fn(),
      spawn: vi.fn(),
      id: subagentDefinition.id,
      isRoot: false,
      parent: undefined,
    } as unknown as AgentInvocation;

    const invocation = {
      definition: agentDefinition,
      prompt: "List files",
      context: { files: [], totalBytes: 0, text: "" },
      history: [],
      messages: [
        { role: "system", content: agentDefinition.systemPrompt },
        { role: "user", content: "List files" },
      ],
      children: [],
      toolRegistry: { schemas: () => [], execute: vi.fn() },
      setSpawnHandler: vi.fn(),
      addChild: vi.fn(),
      spawn: vi.fn().mockResolvedValue(childInvocation),
      id: agentDefinition.id,
      isRoot: true,
      parent: undefined,
    } as unknown as AgentInvocation;

    const invocationFactory = {
      create: vi.fn().mockResolvedValue(invocation),
    };

    const streamRenderer = {
      render: vi.fn(),
      flush: vi.fn(),
    };

    const traceWriter = {
      write: vi.fn(),
    };

    const orchestrator = new AgentOrchestratorService(
      invocationFactory as any,
      streamRenderer as any,
      traceWriter as any,
    );

    const runtime = {
      catalog: {
        enableSubagents: true,
        getSubagent: vi.fn().mockReturnValue({
          id: subagentDefinition.id,
          definition: subagentDefinition,
          model: "gpt-sub",
          provider: { name: "openai", stream: vi.fn() },
          metadata: { name: "Helper" },
        }),
        listSubagents: vi.fn().mockReturnValue([]),
      },
      hooks: { emitAsync: vi.fn().mockResolvedValue({ results: [] }) },
      confirm: vi.fn(),
      cwd: process.cwd(),
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
      traceAppend: true,
      tracePath: undefined,
    } as unknown as Parameters<
      AgentOrchestratorService["runAgent"]
    >[1];

    const parentDescriptor = {
      id: agentDefinition.id,
      definition: agentDefinition,
      model: "gpt-root",
      provider: { name: "openai", stream: vi.fn() },
    } satisfies AgentRuntimeDescriptor;

    const result = await (orchestrator as unknown as {
      executeSpawnTool(
        invocation: AgentInvocation,
        runtime: typeof runtime,
        event: Extract<StreamEvent, { type: "tool_call" }>,
        parentDescriptor: AgentRuntimeDescriptor,
      ): Promise<ToolResult>;
    }).executeSpawnTool(
      invocation,
      runtime,
      {
        type: "tool_call",
        name: "spawn_subagent",
        id: "call-123",
        arguments: {
          agent: subagentDefinition.id,
          prompt: "Handle the delegated task",
        },
      },
      parentDescriptor,
    );

    expect(result.content).toBe("Completed successfully.");
    expect(result.data).toMatchObject({
      finalMessage: "Completed successfully.",
      context: { selectedBundleIds: ["bundle-123"] },
      transcriptSummary:
        "User: Please help with the delegated task. | Assistant: Completed successfully.",
    });
    expect(result.metadata).toMatchObject({
      contextBundleIds: ["bundle-123"],
      historySnippet:
        "User: Please help with the delegated task. | Assistant: Completed successfully.",
    });
  });
});
