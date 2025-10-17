import type { AgentRuntimeDescriptor, StreamEvent, ToolResult } from "@eddie/types";
import {
  AgentStreamEvent,
  ExecutionTreeStateUpdatedEvent,
  HOOK_EVENTS,
} from "@eddie/types";
import { describe, expect, it, vi } from "vitest";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import { AgentRunner, ExecutionTreeStateTracker } from "../../src/agents/agent-runner";

type InvocationOverrides = Partial<AgentInvocation>;

type RunnerOverrides = Partial<ConstructorParameters<typeof AgentRunner>[0]>;

type EventBusLike = ConstructorParameters<typeof AgentRunner>[0]["eventBus"];

const createStream = (events: StreamEvent[]): AsyncIterable<StreamEvent> => ({
  [Symbol.asyncIterator]: async function* () {
    for (const event of events) {
      yield event;
    }
  },
});

const completeOrTimeout = async (
  promise: Promise<void>,
  timeoutMs = 100
): Promise<"completed" | "timeout"> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const completion = promise.then(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    return "completed" as const;
  });

  const timeout = new Promise<"timeout">((resolve) => {
    timeoutId = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  return Promise.race([completion, timeout]);
};

const baseDefinition = {
  id: "agent-1",
  systemPrompt: "You are helpful.",
  tools: [] as [] | undefined,
};

const createInvocation = (overrides: InvocationOverrides = {}): AgentInvocation => ({
  definition: { ...baseDefinition },
  prompt: "Do work",
  context: { files: [], totalBytes: 0, text: "" },
  history: [],
  messages: [
    { role: "system", content: "You are helpful." },
    { role: "user", content: "Do work" },
  ],
  children: [],
  parent: undefined,
  toolRegistry: {
    schemas: () => [],
    execute: vi.fn(),
  },
  setSpawnHandler: vi.fn(),
  addChild: vi.fn(),
  spawn: vi.fn(),
  id: "agent-1",
  isRoot: true,
  ...overrides,
} as unknown as AgentInvocation);

const createDescriptor = (
  overrides: Partial<AgentRuntimeDescriptor> = {}
): AgentRuntimeDescriptor => ({
  id: "agent-1",
  definition: { ...baseDefinition },
  model: "gpt-test",
  provider: {
    name: "openai",
    stream: vi.fn().mockImplementation(() => createStream([{ type: "end" }])),
  },
  ...overrides,
});

const createRunner = (overrides: RunnerOverrides = {}) => {
  const invocation = overrides.invocation ?? createInvocation();
  const descriptor = overrides.descriptor ?? createDescriptor();
  const publish = vi.fn();
  const metrics =
    overrides.metrics ??
    ({
      countMessage: vi.fn(),
      observeToolCall: vi.fn(),
      countError: vi.fn(),
      timeOperation: vi.fn(async (_metric: string, fn: () => Promise<unknown>) => fn()),
    } as unknown as RunnerOverrides["metrics"]);
  const overrideEventBus = (overrides as {
    eventBus?: { publish: (event: unknown) => void };
  }).eventBus;
  const eventBus = overrideEventBus ?? ({
    publish,
  } as { publish: (event: unknown) => void });

  return new AgentRunner({
    invocation,
    descriptor,
    streamRenderer: overrides.streamRenderer ?? {
      render: vi.fn(),
      flush: vi.fn(),
    },
    eventBus,
    hooks: overrides.hooks ?? {
      emitAsync: vi.fn().mockResolvedValue({}),
    },
    logger:
      overrides.logger ??
      ({
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as RunnerOverrides["logger"]),
    cwd: overrides.cwd ?? process.cwd(),
    confirm: overrides.confirm ?? vi.fn(),
    lifecycle:
      overrides.lifecycle ?? {
        metadata: { id: invocation.id, isRoot: invocation.isRoot },
        prompt: invocation.prompt,
        context: { totalBytes: 0, fileCount: 0 },
        historyLength: invocation.history.length,
      },
    startTraceAppend: overrides.startTraceAppend ?? true,
    composeToolSchemas: overrides.composeToolSchemas ?? (() => invocation.toolRegistry.schemas()),
    executeSpawnTool: overrides.executeSpawnTool ??
      (vi.fn() as RunnerOverrides["executeSpawnTool"]),
    applyTranscriptCompactionIfNeeded:
      overrides.applyTranscriptCompactionIfNeeded ?? vi.fn(),
    dispatchHookOrThrow:
      overrides.dispatchHookOrThrow ??
      (vi.fn().mockResolvedValue({}) as RunnerOverrides["dispatchHookOrThrow"]),
    writeTrace: overrides.writeTrace ?? vi.fn(),
    metrics,
    executionTreeTracker: overrides.executionTreeTracker,
  } as unknown as ConstructorParameters<typeof AgentRunner>[0]);
};

describe("AgentRunner", () => {
  it("threads provider response ids into subsequent iterations", async () => {
    const invocation = createInvocation();
    const toolResult: ToolResult = { schema: "tool.schema", content: "done" };
    invocation.toolRegistry.execute = vi.fn().mockResolvedValue(toolResult);
    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "tool_call", id: "call_1", name: "math", arguments: { x: 1 } },
          { type: "end", responseId: "resp_a" },
        ])
      )
      .mockReturnValueOnce(createStream([{ type: "end", responseId: "resp_b" }]));
    const descriptor = createDescriptor({ provider: { name: "openai", stream: providerStream } });

    const runner = createRunner({
      invocation,
      descriptor,
      composeToolSchemas: () => [],
    });

    await runner.run();

    expect(providerStream).toHaveBeenCalledTimes(2);
    const secondCallOptions = providerStream.mock.calls[1]?.[0];
    expect(secondCallOptions).toMatchObject({ previousResponseId: "resp_a" });

    const toolMessage = invocation.messages.find((message) => message.role === "tool");
    const expectedPayload = JSON.stringify(toolResult);

    expect(toolMessage).toBeDefined();
    expect(toolMessage).toMatchObject({ content: expectedPayload });
  });

  it("publishes agent stream events via the event bus", async () => {
    const invocation = createInvocation();
    const streamEvents: StreamEvent[] = [
      { type: "delta", text: "Hello" },
      { type: "end" },
    ];
    const streamRenderer = {
      render: vi.fn(),
      flush: vi.fn(),
    };
    const publish = vi.fn();
    const descriptor = createDescriptor({
      provider: {
        name: "mock",
        stream: vi.fn().mockReturnValue(createStream(streamEvents)),
      },
    });

    const runner = createRunner({
      invocation,
      descriptor,
      streamRenderer: streamRenderer as unknown as RunnerOverrides["streamRenderer"],
      eventBus: { publish } as EventBusLike,
    });

    await runner.run();

    expect(streamRenderer.render).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(streamEvents.length);

    const publishedEvents = publish.mock.calls.map(
      ([event]) => event as AgentStreamEvent
    );

    publishedEvents.forEach((published, index) => {
      expect(published).toBeInstanceOf(AgentStreamEvent);
      expect(published.event).toEqual({
        ...streamEvents[index],
        agentId: invocation.id,
      });
      expect(streamEvents[index]).not.toHaveProperty("agentId");
    });
  });

  it("serializes spawn_subagent results onto the transcript", async () => {
    const invocation = createInvocation();
    const toolResult: ToolResult = {
      schema: "eddie.tool.spawn.result",
      content: "Subagent complete",
      data: { summary: "ok" },
      metadata: { agentId: "child-1" },
    };
    const executeSpawnTool = vi.fn().mockResolvedValue(toolResult);

    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          {
            type: "tool_call",
            id: "spawn_call",
            name: AgentRunner.SPAWN_TOOL_NAME,
            arguments: { prompt: "Run" },
          },
          { type: "end" },
        ])
      )
      .mockReturnValueOnce(createStream([{ type: "end" }]));

    const descriptor = createDescriptor({
      provider: { name: "openai", stream: providerStream },
    });

    const publish = vi.fn();
    const runner = createRunner({
      invocation,
      descriptor,
      executeSpawnTool,
      composeToolSchemas: () => [],
      eventBus: { publish } as EventBusLike,
    });

    await runner.run();

    const toolMessage = invocation.messages.find(
      (message) => message.role === "tool" && message.tool_call_id === "spawn_call"
    );

    const expectedContent = JSON.stringify({
      schema: toolResult.schema,
      content: toolResult.content,
      data: toolResult.data,
      metadata: toolResult.metadata,
    });

    expect(toolMessage).toMatchObject({
      role: "tool",
      name: AgentRunner.SPAWN_TOOL_NAME,
      tool_call_id: "spawn_call",
      content: expectedContent,
    });

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: "tool_result",
          name: AgentRunner.SPAWN_TOOL_NAME,
          id: "spawn_call",
          result: toolResult,
          agentId: invocation.id,
        }),
      })
    );
  });

  it("flushes non-root renderers and emits lifecycle hooks", async () => {
    const flush = vi.fn();
    const hooks = { emitAsync: vi.fn().mockResolvedValue({}) };
    const runner = createRunner({
      invocation: createInvocation({ isRoot: false }),
      streamRenderer: { render: vi.fn(), flush },
      hooks,
      composeToolSchemas: () => [],
      writeTrace: vi.fn(),
    });

    await runner.run();

    expect(flush).toHaveBeenCalledOnce();
    const events = hooks.emitAsync.mock.calls.map(([event]) => event);
    expect(events).toEqual([
      HOOK_EVENTS.beforeAgentStart,
      HOOK_EVENTS.beforeModelCall,
      HOOK_EVENTS.stop,
      HOOK_EVENTS.afterAgentComplete,
      HOOK_EVENTS.subagentStop,
    ]);
  });

  it("dispatches hooks and executes tools when tool calls are streamed", async () => {
    const invocation = createInvocation();
    const toolResult: ToolResult = {
      schema: "tool.schema",
      content: "done",
      data: { message: "ok" },
    };
    const execute = vi.fn().mockResolvedValue(toolResult);
    invocation.toolRegistry.execute = execute;

    const dispatchHookOrThrow = vi
      .fn()
      .mockImplementation(async (event: string, payload: unknown) => {
        if (event === HOOK_EVENTS.preToolUse) {
          return { blocked: undefined };
        }
        if (event === HOOK_EVENTS.postToolUse) {
          expect((payload as any).result).toBe(toolResult);
        }
        return {};
      });

    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "tool_call", id: "call_1", name: "math", arguments: { x: 1 } },
          { type: "end" },
        ])
      )
      .mockReturnValueOnce(
        createStream([
          { type: "delta", text: "All done" },
          { type: "end" },
        ])
      )
      .mockImplementation(() => createStream([{ type: "end" }]));

    const descriptor = createDescriptor({ provider: { name: "openai", stream: providerStream } });

    const publish = vi.fn();
    const runner = createRunner({
      invocation,
      descriptor,
      dispatchHookOrThrow,
      composeToolSchemas: () => [],
      eventBus: { publish } as EventBusLike,
    });

    await expect(completeOrTimeout(runner.run())).resolves.toBe("completed");

    expect(providerStream).toHaveBeenCalledTimes(2);
    expect(invocation.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "All done",
    });

    expect(dispatchHookOrThrow).toHaveBeenCalledWith(
      HOOK_EVENTS.preToolUse,
      expect.objectContaining({ event: expect.objectContaining({ id: "call_1" }) })
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: "call_1" }),
      expect.objectContaining({ cwd: expect.any(String) })
    );
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          type: "tool_result",
          name: "math",
          id: "call_1",
          result: toolResult,
          agentId: invocation.id,
        }),
      })
    );
    expect(invocation.messages.at(-2)).toMatchObject({
      role: "tool",
      name: "math",
      tool_call_id: "call_1",
    });
  });

  it("emits execution tree updates for tool call lifecycle", async () => {
    const invocation = createInvocation();
    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "tool_call", id: "call_1", name: "math", arguments: { x: 1 } },
          { type: "end" },
        ]),
      )
      .mockReturnValueOnce(
        createStream([
          { type: "delta", text: "Complete" },
          { type: "end" },
        ]),
      );
    const descriptor = createDescriptor({
      metadata: { name: "Manager" },
      provider: { name: "openai", stream: providerStream },
    });
    const toolResult: ToolResult = {
      schema: "tool.schema",
      content: "done",
      metadata: { contextBundles: [
        {
          id: "bundle-1",
          label: "Context bundle",
          sizeBytes: 0,
          fileCount: 0,
          source: {
            type: "tool_result",
            agentId: invocation.id,
            toolCallId: "call_1",
          },
        },
      ] },
    };

    invocation.toolRegistry.execute = vi.fn().mockResolvedValue(toolResult);

    const eventBus = { publish: vi.fn() } as EventBusLike;
    const tracker = new ExecutionTreeStateTracker({
      sessionId: "session-1",
      eventBus,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
    });

    const runner = createRunner({
      invocation,
      descriptor,
      composeToolSchemas: () => [],
      eventBus,
      executionTreeTracker: tracker,
    } as unknown as RunnerOverrides);

    await runner.run();

    const stateEvents = eventBus.publish.mock.calls
      .map(([event]) => event)
      .filter((event): event is ExecutionTreeStateUpdatedEvent => event instanceof ExecutionTreeStateUpdatedEvent);

    expect(stateEvents.length).toBeGreaterThanOrEqual(3);

    const [agentRegistered, toolCallUpdate, toolResultUpdate] = stateEvents;

    expect(agentRegistered.state.agentHierarchy).toEqual([
      expect.objectContaining({ id: invocation.id, name: "Manager" }),
    ]);
    expect(agentRegistered.state.toolInvocations).toEqual([]);

    expect(toolCallUpdate.state.toolInvocations).toEqual([
      expect.objectContaining({ id: "call_1", status: "running" }),
    ]);

    const finalInvocation = toolResultUpdate.state.toolInvocations[0];
    expect(finalInvocation).toMatchObject({
      id: "call_1",
      status: "completed",
      metadata: expect.objectContaining({
        contextBundles: expect.arrayContaining([
          expect.objectContaining({ id: "bundle-1" }),
        ]),
      }),
    });

    expect(stateEvents[0]?.state).not.toBe(stateEvents[1]?.state);
  });

  it("includes spawned agents in execution tree state", async () => {
    const parentInvocation = createInvocation();
    const childInvocation = createInvocation({
      id: "agent-child",
      definition: { ...baseDefinition, id: "agent-child" },
      parent: parentInvocation,
      isRoot: false,
    });

    const eventBus = { publish: vi.fn() } as EventBusLike;
    const tracker = new ExecutionTreeStateTracker({
      sessionId: "session-1",
      eventBus,
      now: () => new Date("2024-01-01T00:00:00.000Z"),
    });

    const spawnResult: ToolResult = {
      schema: AgentRunner.SPAWN_TOOL_RESULT_SCHEMA,
      content: "Subagent finished",
      metadata: {
        agentId: "agent-child",
        model: "gpt-child",
        provider: "openai",
        parentAgentId: parentInvocation.id,
        request: { prompt: "help" },
      },
    };

    const executeSpawnTool = vi.fn().mockResolvedValue(spawnResult);

    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          {
            type: "tool_call",
            id: "spawn-1",
            name: AgentRunner.SPAWN_TOOL_NAME,
            arguments: { prompt: "Delegate" },
          },
          { type: "end" },
        ]),
      )
      .mockReturnValueOnce(createStream([{ type: "end" }]));

    const runner = createRunner({
      invocation: parentInvocation,
      descriptor: createDescriptor({ provider: { name: "openai", stream: providerStream } }),
      composeToolSchemas: () => [],
      eventBus,
      executionTreeTracker: tracker,
      executeSpawnTool,
    } as unknown as RunnerOverrides);

    parentInvocation.toolRegistry.execute = vi.fn();

    await runner.run();

    const childRunner = createRunner({
      invocation: childInvocation,
      descriptor: createDescriptor({ id: "agent-child" }),
      composeToolSchemas: () => [],
      eventBus,
      executionTreeTracker: tracker,
    } as unknown as RunnerOverrides);

    await childRunner.run();

    const stateEvents = eventBus.publish.mock.calls
      .map(([event]) => event)
      .filter((event): event is ExecutionTreeStateUpdatedEvent => event instanceof ExecutionTreeStateUpdatedEvent);

    const latestState = stateEvents.at(-1)?.state;
    expect(latestState?.agentHierarchy).toEqual([
      expect.objectContaining({ id: parentInvocation.id }),
      expect.objectContaining({ id: childInvocation.id, lineage: [parentInvocation.id] }),
    ]);

    const spawnNode = latestState?.toolInvocations.find((node) => node.id === "spawn-1");
    expect(spawnNode).toMatchObject({ status: "completed" });
  });
});
