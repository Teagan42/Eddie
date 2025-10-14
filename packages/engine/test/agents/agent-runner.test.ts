import { describe, expect, it, vi } from "vitest";
import { HOOK_EVENTS } from "@eddie/hooks";
import type { StreamEvent, ToolResult } from "@eddie/types";
import { AgentRunner } from "../../src/agents/agent-runner";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type { AgentRuntimeDescriptor } from "../../src/agents/agent-runtime.types";

type InvocationOverrides = Partial<AgentInvocation>;

type RunnerOverrides = Partial<ConstructorParameters<typeof AgentRunner>[0]>;

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

  return new AgentRunner({
    invocation,
    descriptor,
    streamRenderer: overrides.streamRenderer ?? {
      render: vi.fn(),
      flush: vi.fn(),
    },
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
  });
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

    const render = vi.fn();
    const runner = createRunner({
      invocation,
      descriptor,
      executeSpawnTool,
      streamRenderer: { render, flush: vi.fn() },
      composeToolSchemas: () => [],
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

    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
        name: AgentRunner.SPAWN_TOOL_NAME,
        id: "spawn_call",
        result: toolResult,
        agentId: invocation.id,
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

    const render = vi.fn();
    const runner = createRunner({
      invocation,
      descriptor,
      dispatchHookOrThrow,
      streamRenderer: { render, flush: vi.fn() },
      composeToolSchemas: () => [],
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
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "tool_result",
        name: "math",
        id: "call_1",
        result: toolResult,
        agentId: invocation.id,
      })
    );
    expect(invocation.messages.at(-2)).toMatchObject({
      role: "tool",
      name: "math",
      tool_call_id: "call_1",
    });
  });
});
