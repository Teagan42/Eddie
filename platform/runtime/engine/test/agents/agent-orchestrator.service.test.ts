import { describe, expect, it, vi } from "vitest";
import type { StreamEvent, ToolResult } from "@eddie/types";
import { AgentOrchestratorService } from "../../src/agents/agent-orchestrator.service";
import { AgentRunner } from "../../src/agents/agent-runner";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type {
  AgentRuntimeCatalog,
  AgentRuntimeDescriptor,
} from "@eddie/types";
import type {
  AgentRunLoop,
  ToolCallHandler,
  TraceWriterDelegate,
} from "../../src/agents/runner";

const createStream = (events: StreamEvent[]): AsyncIterable<StreamEvent> => ({
  [Symbol.asyncIterator]: async function* () {
    for (const event of events) {
      yield event;
    }
  },
});

const createMetrics = () => ({
  countMessage: vi.fn(),
  observeToolCall: vi.fn(),
  countError: vi.fn(),
  timeOperation: vi.fn(async (_metric: string, fn: () => Promise<unknown>) => fn()),
  reset: vi.fn(),
  snapshot: vi.fn(() => ({ counters: {}, histograms: {} })),
});

const createRunnerDependencies = () => {
  const traceWriterDelegate = {
    write: vi.fn(),
  } as unknown as TraceWriterDelegate;
  const toolCallHandler = {
    handle: vi.fn(),
  } as unknown as ToolCallHandler;
  const runLoop = {
    run: vi
      .fn<AgentRunLoop["run"]>()
      .mockResolvedValue({ agentFailed: false, iterationCount: 0 }),
  } as unknown as AgentRunLoop;

  return { traceWriterDelegate, toolCallHandler, runLoop };
};

const createExecutionTreeTrackerFactory = () => ({
  create: vi.fn(),
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
      setRuntime: vi.fn(),
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
      transcriptCompactor: undefined,
      metrics: createMetrics(),
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

    const eventBus = { publish: vi.fn() };
    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      invocationFactory as any,
      streamRenderer as any,
      eventBus as any,
      traceWriter as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
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

  it("creates agent runners with injected runner collaborators", async () => {
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
      setRuntime: vi.fn(),
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
      transcriptCompactor: undefined,
      metrics: createMetrics(),
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

    const eventBus = { publish: vi.fn() };
    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      invocationFactory as any,
      streamRenderer as any,
      eventBus as any,
      traceWriter as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
    );

    const runSpy = vi
      .spyOn(AgentRunner.prototype as Record<string, unknown>, "run")
      .mockImplementation(async function (this: Record<string, unknown>) {
        expect(this.runLoop).toBe(runnerDeps.runLoop);
        expect(this.toolCallHandler).toBe(runnerDeps.toolCallHandler);
        expect(this.traceWriter).toBe(runnerDeps.traceWriterDelegate);
      });

    await orchestrator.runAgent(
      { definition: agentDefinition, prompt: "List files" },
      runtime as any,
    );

    expect(runSpy).toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it("does not expose a stream renderer mutator", () => {
    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      { create: vi.fn() } as any,
      { render: vi.fn(), flush: vi.fn() } as any,
      { publish: vi.fn() } as any,
      { write: vi.fn() } as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
    );

    expect("setStreamRenderer" in orchestrator).toBe(false);
  });

  it("annotates spawn_subagent schema with structured output contract", () => {
    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      { create: vi.fn() } as any,
      { render: vi.fn(), flush: vi.fn() } as any,
      { publish: vi.fn() } as any,
      { write: vi.fn() } as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
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
      transcriptCompactor: undefined,
      metrics: createMetrics(),
    };

    const spawnSchema = (
      orchestrator as unknown as {
        createSpawnToolSchema: (runtime: typeof runtime) => { outputSchema?: unknown };
      }
    ).createSpawnToolSchema(runtime);

    expect(spawnSchema?.outputSchema).toMatchObject({
      type: "json_schema",
      name: AgentRunner.SPAWN_TOOL_RESULT_SCHEMA,
      strict: true,
    });

    const schema = spawnSchema?.outputSchema?.schema as Record<string, unknown>;
    expect(schema).toBeDefined();
    expect(schema).toMatchObject({
      type: "object",
      description: "Structured result emitted when a subagent run completes.",
      additionalProperties: false,
    });
    expect(schema.required).toEqual(["schema", "content", "data", "metadata"]);

    const properties = schema?.properties as Record<string, Record<string, unknown>>;
    expect(properties.schema).toMatchObject({
      type: "string",
      const: AgentRunner.SPAWN_TOOL_RESULT_SCHEMA,
    });
    expect(properties.content).toMatchObject({ type: "string" });

    const dataSchema = properties.data as Record<string, unknown>;
    expect(dataSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(dataSchema.required).toEqual([
      "agentId",
      "messageCount",
      "prompt",
      "blocked",
      "finalMessage",
      "history",
      "transcriptSummary",
      "historySnippet",
    ]);

    const dataProps = dataSchema.properties as Record<string, Record<string, unknown>>;
    expect(dataProps.agentId).toMatchObject({ type: "string" });
    expect(dataProps.messageCount).toMatchObject({ type: "integer" });
    expect(dataProps.prompt).toMatchObject({ type: "string" });
    expect(dataProps.blocked).toMatchObject({ type: "boolean" });

    for (const key of ["variables", "context", "requestContext"]) {
      expect(dataProps[key]).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      const patternProps = dataProps[key]?.patternProperties as Record<string, unknown>;
      expect(patternProps).toBeDefined();
      expect(Object.keys(patternProps ?? {})).toContain("^.*$");
    }

    const historySchema = dataProps.history as Record<string, unknown>;
    expect(historySchema).toMatchObject({ type: "array" });
    const historyItems = historySchema.items as Record<string, unknown>;
    expect(historyItems).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(historyItems.required).toEqual(["role", "content", "name", "tool_call_id"]);

    const metadataSchema = properties.metadata as Record<string, unknown>;
    expect(metadataSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(metadataSchema.required).toEqual([
      "agentId",
      "model",
      "provider",
      "parentAgentId",
      "blocked",
      "name",
      "description",
      "profileId",
      "routingThreshold",
      "finalMessage",
      "transcriptSummary",
      "historySnippet",
      "contextBundleIds",
      "request",
    ]);

    const metadataProps = metadataSchema.properties as Record<string, Record<string, unknown>>;
    expect(metadataProps.blocked).toMatchObject({ type: "boolean" });

    const requestSchema = metadataProps.request as Record<string, unknown>;
    expect(requestSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(requestSchema.required).toEqual(["prompt"]);

    const requestProps = requestSchema.properties as Record<string, Record<string, unknown>>;
    expect(requestProps.prompt).toMatchObject({ type: "string" });
    expect(requestProps.variables).toMatchObject({ type: "object", additionalProperties: false });
    expect(
      Object.keys((requestProps.variables?.patternProperties ?? {}) as Record<string, unknown>),
    ).toContain("^.*$");
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
      setRuntime: vi.fn(),
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
      metrics: createMetrics(),
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

    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      invocationFactory as any,
      streamRenderer as any,
      { publish: vi.fn() } as any,
      traceWriter as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
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
      setRuntime: vi.fn(),
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
      setRuntime: vi.fn(),
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

    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      invocationFactory as any,
      streamRenderer as any,
      { publish: vi.fn() } as any,
      traceWriter as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
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
      metrics: createMetrics(),
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

  it("merges cached compactor history with live transcript for spawn results", async () => {
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

    const cachedHistory = [
      { role: "system", content: subagentDefinition.systemPrompt },
      { role: "user", content: "   Please help with the delegated task.   " },
    ];

    const childInvocation = {
      definition: subagentDefinition,
      prompt: "Handle the delegated task",
      context: { files: [], totalBytes: 0, text: "" },
      history: cachedHistory,
      messages: [
        { role: "system", content: subagentDefinition.systemPrompt },
        { role: "user", content: "   Please help with the delegated task.   " },
        { role: "assistant", content: "  Completed successfully.  " },
      ],
      children: [],
      toolRegistry: { schemas: () => [], execute: vi.fn() },
      setSpawnHandler: vi.fn(),
      setRuntime: vi.fn(),
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
      setRuntime: vi.fn(),
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

    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      invocationFactory as any,
      streamRenderer as any,
      { publish: vi.fn() } as any,
      traceWriter as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
    );

    const getFullHistoryFor = vi.fn().mockReturnValue(cachedHistory);

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
      metrics: createMetrics(),
      transcriptCompaction: {
        getFullHistoryFor,
      },
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

    expect(getFullHistoryFor).toHaveBeenCalledWith(
      childInvocation,
      expect.objectContaining({ id: subagentDefinition.id }),
    );
    expect(result.data?.history).toEqual([
      { role: "system", content: subagentDefinition.systemPrompt },
      { role: "user", content: "   Please help with the delegated task.   " },
      { role: "assistant", content: "  Completed successfully.  " },
    ]);
    expect(result.data?.messageCount).toBe(3);
  });

  it("collects invocations breadth-first without relying on Array.shift", () => {
    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      { create: vi.fn() } as any,
      { render: vi.fn(), flush: vi.fn() } as any,
      { publish: vi.fn() } as any,
      { write: vi.fn() } as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
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
        setRuntime: vi.fn(),
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

  it("creates execution tree trackers via runtime factories when available", () => {
    const runnerDeps = createRunnerDependencies();
    const executionTreeTracker = {
      registerAgent: vi.fn(),
      recordAgentCompletion: vi.fn(),
    };
    const executionTreeTrackerFactory = vi
      .fn()
      .mockReturnValue(executionTreeTracker);

    const orchestrator = new AgentOrchestratorService(
      { create: vi.fn() } as any,
      { render: vi.fn(), flush: vi.fn() } as any,
      { publish: vi.fn() } as any,
      { write: vi.fn() } as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      { create: executionTreeTrackerFactory } as any
    );

    const runtime = {
      catalog: {
        enableSubagents: true,
        getAgent: vi.fn(),
        getSubagent: vi.fn(),
        listSubagents: vi.fn().mockReturnValue([]),
      },
      hooks: { emitAsync: vi.fn().mockResolvedValue({ results: [] }) },
      confirm: vi.fn(),
      cwd: process.cwd(),
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
      traceAppend: true,
      tracePath: undefined,
      metrics: createMetrics(),
      sessionId: "session-123",
      executionTreeTrackerFactory,
    } as unknown as Parameters<
      AgentOrchestratorService["runAgent"]
    >[1];

    const tracker = (
      orchestrator as unknown as {
        ensureExecutionTreeTracker(
          runtime: Parameters<AgentOrchestratorService["runAgent"]>[1]
        ): unknown;
      }
    ).ensureExecutionTreeTracker(runtime);

    expect(executionTreeTrackerFactory).toHaveBeenCalledTimes(1);
    expect(executionTreeTrackerFactory).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-123" })
    );
    expect(tracker).toBe(executionTreeTracker);
    expect(runtime.executionTreeTracker).toBe(executionTreeTracker);
  });

  it("delegates transcript compaction to the runtime workflow", async () => {
    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      { create: vi.fn() } as any,
      { render: vi.fn(), flush: vi.fn() } as any,
      { publish: vi.fn() } as any,
      { write: vi.fn() } as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
    );

    const invocation = {
      id: "manager",
      definition: { id: "manager", systemPrompt: "", tools: [] },
      messages: [],
      isRoot: true,
      parent: undefined,
    } as unknown as AgentInvocation;

    const descriptor: AgentRuntimeDescriptor = {
      id: "manager",
      definition: invocation.definition,
      model: "test",
      provider: { name: "provider", stream: vi.fn() },
    };

    (orchestrator as any).descriptorMap.set(invocation, descriptor);

    const compactor = { plan: vi.fn() } as unknown;
    const workflow = {
      selectFor: vi.fn(() => compactor),
      planAndApply: vi.fn(async () => undefined),
    };

    const runtime = {
      catalog: {
        enableSubagents: false,
        getManager: vi.fn(),
        getAgent: vi.fn(),
        getSubagent: vi.fn(),
        listSubagents: () => [],
      },
      hooks: { emitAsync: vi.fn().mockResolvedValue({}) },
      confirm: vi.fn(),
      cwd: process.cwd(),
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
      transcriptCompaction: workflow,
      metrics: createMetrics(),
    } as unknown;

    const lifecycle = {
      metadata: {
        id: "manager",
        isRoot: true,
        depth: 0,
        systemPrompt: "",
        tools: [],
      },
      prompt: "Prompt",
      context: { totalBytes: 0, fileCount: 0 },
      historyLength: 0,
    };

    await (orchestrator as any).applyTranscriptCompactionIfNeeded(
      runtime,
      invocation,
      1,
      lifecycle,
    );

    expect(workflow.selectFor).toHaveBeenCalledWith(invocation, descriptor);
    expect(workflow.planAndApply).toHaveBeenCalledWith(
      compactor,
      invocation,
      1,
      runtime,
      lifecycle,
    );
  });

  it("writes metrics snapshots alongside trace events", async () => {
    const traceWriter = { write: vi.fn().mockResolvedValue(undefined) };
    const runnerDeps = createRunnerDependencies();
    const orchestrator = new AgentOrchestratorService(
      { create: vi.fn() } as any,
      { render: vi.fn(), flush: vi.fn() } as any,
      { publish: vi.fn() } as any,
      traceWriter as any,
      runnerDeps.runLoop,
      runnerDeps.toolCallHandler,
      runnerDeps.traceWriterDelegate,
      createExecutionTreeTrackerFactory(),
    );

    const metrics = createMetrics();
    metrics.snapshot.mockReturnValue({
      counters: { "engine.messages.user": 1 },
      histograms: { "engine.timers.loop": [10] },
    });

    const runtime = {
      tracePath: "/tmp/run.jsonl",
      sessionId: "session-1",
      hooks: { emitAsync: vi.fn().mockResolvedValue({}) },
      catalog: {
        enableSubagents: false,
        getManager: vi.fn(),
        getAgent: vi.fn(),
        getSubagent: vi.fn(),
        listSubagents: () => [],
      },
      confirm: vi.fn(),
      cwd: process.cwd(),
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
      metrics,
    } as unknown;

    const invocation = {
      id: "manager",
      definition: { id: "manager", systemPrompt: "", tools: [] },
      prompt: "Prompt",
      context: { totalBytes: 0, files: [], text: "" },
      history: [],
      parent: undefined,
      messages: [],
      children: [],
    } as unknown as AgentInvocation;

    const event = {
      phase: "invoke",
      data: { kind: "log" },
    };

    await (orchestrator as any).writeTrace(runtime, invocation, event, true);

    expect(metrics.snapshot).toHaveBeenCalledTimes(1);
    expect(traceWriter.write).toHaveBeenCalledWith(
      "/tmp/run.jsonl",
      expect.objectContaining({
        metrics: {
          counters: { "engine.messages.user": 1 },
          histograms: { "engine.timers.loop": [10] },
        },
      }),
      true,
    );
  });
});
