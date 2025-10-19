import type { StreamEvent, ToolResult } from "@eddie/types";
import {
  AgentStreamEvent,
  ExecutionTreeStateUpdatedEvent,
  HOOK_EVENTS,
} from "@eddie/types";
import { describe, expect, it, vi } from "vitest";
import { AgentRunner } from "../../src/agents/agent-runner";
import { ExecutionTreeStateTracker } from "../../src/execution-tree/execution-tree-tracker.service";
import {
  createAgentRunnerTestContext,
  createDescriptor,
  createInvocation,
  createStream,
  type EventBusLike,
  type RunnerOverrides,
} from "./__fixtures__/runner-fixture";

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

describe("AgentRunner", () => {
  it("delegates execution to the injected run loop", async () => {
    const runLoop = {
      run: vi.fn().mockResolvedValue({ agentFailed: false, iterationCount: 0 }),
    };

    const { runner } = createAgentRunnerTestContext({
      runnerDependencies: { runLoop },
    });

    await runner.run();

    expect(runLoop.run).toHaveBeenCalledTimes(1);
    expect(runLoop.run).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          invocation: expect.objectContaining({ id: "agent-1" }),
        }),
        spawnToolName: AgentRunner.SPAWN_TOOL_NAME,
      })
    );
  });

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

    const { runner } = createAgentRunnerTestContext({
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

    const { runner, publish: published } = createAgentRunnerTestContext({
      invocation,
      descriptor,
      streamRenderer: streamRenderer as RunnerOverrides["streamRenderer"],
      eventBus: { publish } as EventBusLike,
    });

    await runner.run();

    expect(streamRenderer.render).not.toHaveBeenCalled();
    expect(published).toHaveBeenCalledTimes(streamEvents.length);

    const publishedEvents = published.mock.calls.map(
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
    const { runner, publish: published } = createAgentRunnerTestContext({
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

    expect(published).toHaveBeenCalledWith(
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

  it("omits the delegation prompt from spawn_subagent results", () => {
    const parentDescriptor = createDescriptor({
      id: "manager-agent",
      definition: {
        id: "manager-agent",
        systemPrompt: "Coordinate work",
        tools: [],
      },
    });

    const childDescriptor = createDescriptor({
      id: "writer-agent",
      definition: {
        id: "writer-agent",
        systemPrompt: "Handle delegated tasks",
        tools: [],
      },
    });

    const childInvocation = createInvocation({
      id: "writer-agent",
      definition: childDescriptor.definition,
      prompt: "Summarize the quarterly report in 200 words",
      messages: [
        { role: "system", content: "Handle delegated tasks" },
        { role: "user", content: "Understood." },
        { role: "assistant", content: "Here is the summary." },
      ],
      isRoot: false,
    });

    const result = AgentRunner.buildSubagentResult({
      child: childInvocation,
      descriptor: childDescriptor,
      parentDescriptor,
      request: {
        prompt: "Summarize the quarterly report in 200 words",
      },
    });

    expect(result.data?.prompt).toBeUndefined();
    expect(result.metadata?.request?.prompt).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(
      "Summarize the quarterly report in 200 words"
    );
  });

  it("flushes non-root renderers and emits lifecycle hooks", async () => {
    const flush = vi.fn();
    const hooks = { emitAsync: vi.fn().mockResolvedValue({}) };
    const streamRenderer = { render: vi.fn(), flush };
    const { runner, hooks: hookBus } = createAgentRunnerTestContext({
      invocation: createInvocation({ isRoot: false }),
      streamRenderer: streamRenderer as RunnerOverrides["streamRenderer"],
      hooks: hooks as RunnerOverrides["hooks"],
      composeToolSchemas: () => [],
      writeTrace: vi.fn(),
    });

    await runner.run();

    expect(flush).toHaveBeenCalledOnce();
    const events = hookBus.emitAsync.mock.calls.map(([event]) => event);
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
    const { runner, publish: published } = createAgentRunnerTestContext({
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
    expect(published).toHaveBeenCalledWith(
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

    const publish = vi.fn();
    const eventBus = { publish } as EventBusLike;
    const tracker = new ExecutionTreeStateTracker(
      eventBus,
      () => new Date("2024-01-01T00:00:00.000Z"),
      { sessionId: "session-1" }
    );

    const { runner } = createAgentRunnerTestContext({
      invocation,
      descriptor,
      composeToolSchemas: () => [],
      eventBus,
      executionTreeTracker: tracker,
    });

    await runner.run();

    const stateEvents = publish.mock.calls
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
      definition: { ...parentInvocation.definition, id: "agent-child" },
      parent: parentInvocation,
      isRoot: false,
    });

    const publish = vi.fn();
    const eventBus = { publish } as EventBusLike;
    const tracker = new ExecutionTreeStateTracker(
      eventBus,
      () => new Date("2024-01-01T00:00:00.000Z"),
      { sessionId: "session-1" }
    );

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

    const { runner: parentRunner } = createAgentRunnerTestContext({
      invocation: parentInvocation,
      descriptor: createDescriptor({ provider: { name: "openai", stream: providerStream } }),
      composeToolSchemas: () => [],
      eventBus,
      executionTreeTracker: tracker,
      executeSpawnTool,
    });

    parentInvocation.toolRegistry.execute = vi.fn();

    await parentRunner.run();

    const { runner: childRunner } = createAgentRunnerTestContext({
      invocation: childInvocation,
      descriptor: createDescriptor({ id: "agent-child" }),
      composeToolSchemas: () => [],
      eventBus,
      executionTreeTracker: tracker,
    });

    await childRunner.run();

    const stateEvents = publish.mock.calls
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
