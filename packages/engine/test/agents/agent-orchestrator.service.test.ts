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
  it("delegates invocation execution to the agent runner", async () => {
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

    const descriptor: AgentRuntimeDescriptor = {
      id: agentDefinition.id,
      definition: agentDefinition,
      model: "gpt-test",
      provider: {
        name: "openai",
        stream: vi.fn().mockReturnValue(createStream([{ type: "end" }])),
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

    const runSpy = vi
      .spyOn(AgentRunner.prototype as Record<string, unknown>, "run")
      .mockResolvedValue(undefined);

    await orchestrator.runAgent(
      { definition: agentDefinition, prompt: "List files" },
      runtime as any,
    );

    expect(invocationFactory.create).toHaveBeenCalledWith(
      agentDefinition,
      expect.objectContaining({ prompt: "List files" }),
      undefined,
    );
    expect(runSpy).toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it("annotates spawn_subagent schema with structured output contract", () => {
    const orchestrator = new AgentOrchestratorService(
      { create: vi.fn() } as any,
      { render: vi.fn(), flush: vi.fn() } as any,
      { write: vi.fn() } as any,
    );

    const runtime = {
      catalog: {
        enableSubagents: true,
        getManager: vi.fn(),
        getAgent: vi.fn(),
        getSubagent: vi.fn(),
        listSubagents: () => [
          {
            id: "summariser",
            definition: {
              id: "summariser",
              systemPrompt: "Summaries",
              tools: [],
            },
            model: "gpt-summarise",
            provider: { name: "openai", stream: vi.fn() },
          },
        ],
      },
      hooks: { emitAsync: vi.fn() },
      confirm: vi.fn(),
      cwd: process.cwd(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    };

    const spawnSchema = (
      orchestrator as unknown as {
        createSpawnToolSchema: (runtime: typeof runtime) => { outputSchema?: unknown };
      }
    ).createSpawnToolSchema(runtime);

    expect(spawnSchema?.outputSchema).toEqual({
      type: "json_schema",
      name: AgentRunner.SPAWN_TOOL_RESULT_SCHEMA,
      strict: true,
      schema: {
        type: "object",
        description: "Structured result emitted when a subagent run completes.",
        additionalProperties: false,
        required: ["schema", "content", "data"],
        properties: {
          schema: {
            type: "string",
            const: AgentRunner.SPAWN_TOOL_RESULT_SCHEMA,
            description:
              "Canonical identifier for the spawn_subagent tool result schema.",
          },
          content: {
            type: "string",
            description: "Human-readable summary of the subagent's final response.",
          },
          data: {
            type: "object",
            description: "Structured payload capturing the subagent invocation details.",
            additionalProperties: true,
            required: ["agentId", "messageCount", "prompt", "context"],
            properties: {
              agentId: {
                type: "string",
                description: "Identifier of the subagent that handled the request.",
              },
              messageCount: {
                type: "integer",
                minimum: 0,
                description: "Total number of transcript messages generated by the subagent.",
              },
              prompt: {
                type: "string",
                description: "Prompt text supplied to the subagent when it was spawned.",
              },
              finalMessage: {
                type: "string",
                description: "Final assistant message produced by the subagent, if any.",
              },
              variables: {
                type: "object",
                description: "Template variables merged into the subagent's prompt context.",
                additionalProperties: true,
              },
              context: {
                type: "object",
                description: "Snapshot of the runtime context shared with the subagent.",
                additionalProperties: true,
              },
              requestContext: {
                type: "object",
                description:
                  "Context overrides applied specifically to this spawn request.",
                additionalProperties: true,
              },
              history: {
                type: "array",
                description: "Full transcript history of the subagent conversation.",
                items: {
                  type: "object",
                  required: ["role", "content"],
                  additionalProperties: true,
                  properties: {
                    role: {
                      type: "string",
                      enum: ["system", "user", "assistant", "tool"],
                    },
                    content: { type: "string" },
                    name: { type: "string" },
                    tool_call_id: { type: "string" },
                  },
                },
              },
              transcriptSummary: {
                type: "string",
                description: "Short summary of the subagent transcript.",
              },
              historySnippet: {
                type: "string",
                description: "Abbreviated snippet of the final transcript turns.",
              },
            },
          },
          metadata: {
            type: "object",
            description: "Runtime metadata describing the subagent invocation.",
            additionalProperties: true,
            properties: {
              agentId: { type: "string" },
              model: { type: "string" },
              provider: { type: "string" },
              parentAgentId: { type: "string" },
              blocked: { type: "boolean" },
              name: { type: "string" },
              description: { type: "string" },
              profileId: { type: "string" },
              routingThreshold: { type: "number" },
              finalMessage: { type: "string" },
              transcriptSummary: { type: "string" },
              historySnippet: { type: "string" },
              contextBundleIds: {
                type: "array",
                items: { type: "string" },
              },
              request: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
      },
    });
  });

  it("rejects hook-driven agent runs when subagents are disabled", async () => {
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

    const descriptor: AgentRuntimeDescriptor = {
      id: agentDefinition.id,
      definition: agentDefinition,
      model: "gpt-test",
      provider: {
        name: "openai",
        stream: vi.fn().mockReturnValue(createStream([{ type: "end" }])),
      },
    };

    const catalog: AgentRuntimeCatalog = {
      enableSubagents: false,
      getManager: () => descriptor,
      getAgent: vi.fn().mockReturnValue(descriptor),
      getSubagent: () => undefined,
      listSubagents: () => [],
    };

    let registeredRunner: ((options: {
      agentId: string;
      prompt: string;
      context?: unknown;
      variables?: Record<string, unknown>;
    }) => Promise<unknown>) | undefined;

    const runtime = {
      catalog,
      hooks: {
        emitAsync: vi.fn().mockResolvedValue({}),
        setAgentRunner: vi.fn((runner) => {
          registeredRunner = runner;
        }),
        hasAgentRunner: vi.fn().mockReturnValue(false),
      },
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

    const runSpy = vi
      .spyOn(AgentRunner.prototype as Record<string, unknown>, "run")
      .mockResolvedValue(undefined);

    await orchestrator.runAgent(
      { definition: agentDefinition, prompt: "List files" },
      runtime as any,
    );

    expect(runtime.hooks.setAgentRunner).toHaveBeenCalled();
    expect(registeredRunner).toBeDefined();

    await expect(
      registeredRunner?.({ agentId: "agent-1", prompt: "Do another thing" })
    ).rejects.toThrow("Subagent delegation is disabled for this run.");

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
    expect(result.data?.history).toEqual([
      { role: "system", content: subagentDefinition.systemPrompt },
      { role: "user", content: "   Please help with the delegated task.   " },
      { role: "assistant", content: "  Completed successfully.  " },
    ]);
    expect(result.metadata).toMatchObject({
      contextBundleIds: ["bundle-123"],
      historySnippet:
        "User: Please help with the delegated task. | Assistant: Completed successfully.",
    });
  });

  it("collects invocations breadth-first without relying on Array.shift", () => {
    const orchestrator = new AgentOrchestratorService(
      { create: vi.fn() } as any,
      { render: vi.fn(), flush: vi.fn() } as any,
      { write: vi.fn() } as any,
    );

    const createInvocation = (
      id: string,
      children: AgentInvocation[] = [],
    ): AgentInvocation =>
      ({
        id,
        children,
        addChild: vi.fn(),
        setSpawnHandler: vi.fn(),
        toolRegistry: { schemas: () => [], execute: vi.fn() },
        definition: { id, systemPrompt: "", tools: [] },
        prompt: "",
        context: { files: [], totalBytes: 0, text: "" },
        history: [],
        messages: [],
        spawn: vi.fn(),
        isRoot: id === "root",
        parent: undefined,
      }) as unknown as AgentInvocation;

    const leafA = createInvocation("leaf-a");
    const leafB = createInvocation("leaf-b");
    const childA = createInvocation("child-a", [leafA]);
    const childB = createInvocation("child-b", [leafB]);
    const root = createInvocation("root", [childA, childB]);

    const originalShift = Array.prototype.shift;
    let shiftCallCount = 0;

    Array.prototype.shift = function shift(this: unknown[], ...args: unknown[]) {
      shiftCallCount += 1;
      return originalShift.apply(this, args as [never]);
    } as Array<unknown>["shift"];

    try {
      const traversal = orchestrator.collectInvocations(root);

      expect(traversal.map((invocation) => invocation.id)).toEqual([
        "root",
        "child-a",
        "child-b",
        "leaf-a",
        "leaf-b",
      ]);
      expect(shiftCallCount).toBe(0);
    } finally {
      Array.prototype.shift = originalShift;
    }
  });
});
