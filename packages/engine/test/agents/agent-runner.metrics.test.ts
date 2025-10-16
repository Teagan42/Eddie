import { describe, expect, it, vi } from "vitest";
import type { StreamEvent, ToolResult } from "@eddie/types";
import { AgentRunner } from "../../src/agents/agent-runner";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type { AgentRuntimeDescriptor } from "../../src/agents/agent-runtime.types";

type RunnerOverrides = Partial<ConstructorParameters<typeof AgentRunner>[0]>;

type MetricsLike = {
  countMessage: ReturnType<typeof vi.fn>;
  observeToolCall: ReturnType<typeof vi.fn>;
  countError: ReturnType<typeof vi.fn>;
  timeOperation: ReturnType<typeof vi.fn>;
};

const createStream = (events: StreamEvent[]): AsyncIterable<StreamEvent> => ({
  [Symbol.asyncIterator]: async function* () {
    for (const event of events) {
      yield event;
    }
  },
});

const baseDefinition = {
  id: "agent-1",
  systemPrompt: "You are helpful.",
  tools: [] as [] | undefined,
};

const createInvocation = (overrides: Partial<AgentInvocation> = {}): AgentInvocation => ({
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
    schemas: vi.fn(() => []),
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

const createMetrics = (): MetricsLike => ({
  countMessage: vi.fn(),
  observeToolCall: vi.fn(),
  countError: vi.fn(),
  timeOperation: vi.fn(async (_metric: string, fn: () => Promise<unknown>) => fn()),
});

const createRunner = (overrides: RunnerOverrides = {}) => {
  const invocation = overrides.invocation ?? createInvocation();
  const descriptor = overrides.descriptor ?? createDescriptor();
  const metrics = overrides.metrics ?? createMetrics();

  return {
    runner: new AgentRunner({
      invocation,
      descriptor,
      streamRenderer: overrides.streamRenderer ?? { render: vi.fn(), flush: vi.fn() },
      eventBus: overrides.eventBus ?? { publish: vi.fn() },
      hooks: overrides.hooks ?? { emitAsync: vi.fn().mockResolvedValue({}) },
      logger: overrides.logger ?? ({ warn: vi.fn(), error: vi.fn() } as RunnerOverrides["logger"]),
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
      executeSpawnTool: overrides.executeSpawnTool ?? (vi.fn() as RunnerOverrides["executeSpawnTool"]),
      applyTranscriptCompactionIfNeeded:
        overrides.applyTranscriptCompactionIfNeeded ?? vi.fn(),
      dispatchHookOrThrow:
        overrides.dispatchHookOrThrow ??
        (vi.fn().mockResolvedValue({}) as RunnerOverrides["dispatchHookOrThrow"]),
      writeTrace: overrides.writeTrace ?? vi.fn(),
      metrics: metrics as unknown as RunnerOverrides["metrics"],
    } as unknown as ConstructorParameters<typeof AgentRunner>[0]),
    invocation,
    descriptor,
    metrics,
  };
};

describe("AgentRunner metrics", () => {
  it("records successful tool calls", async () => {
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
      .mockReturnValueOnce(createStream([{ type: "end" }]));
    const descriptor = createDescriptor({ provider: { name: "mock", stream: providerStream } });
    const dispatchHookOrThrow = vi.fn().mockResolvedValue({});
    const metrics = createMetrics();

    const { runner } = createRunner({
      invocation,
      descriptor,
      dispatchHookOrThrow,
      metrics,
    });

    await runner.run();

    expect(metrics.observeToolCall).toHaveBeenCalledWith({
      name: "math",
      status: "success",
    });
  });

  it("records vetoed tool calls", async () => {
    const invocation = createInvocation();
    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "tool_call", id: "call_1", name: "math", arguments: { x: 1 } },
          { type: "end", responseId: "resp_a" },
        ])
      )
      .mockReturnValueOnce(createStream([{ type: "end" }]));
    const descriptor = createDescriptor({ provider: { name: "mock", stream: providerStream } });
    const dispatchHookOrThrow = vi.fn().mockResolvedValue({ blocked: { reason: "no" } });
    const metrics = createMetrics();

    const { runner } = createRunner({
      invocation,
      descriptor,
      dispatchHookOrThrow,
      metrics,
    });

    await runner.run();

    expect(metrics.observeToolCall).toHaveBeenCalledWith({
      name: "math",
      status: "blocked",
    });
  });

  it("records tool call errors and transcript compaction timing", async () => {
    const invocation = createInvocation();
    invocation.toolRegistry.execute = vi.fn().mockRejectedValue(new Error("fail"));
    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "tool_call", id: "call_1", name: "math", arguments: { x: 1 } },
          { type: "end", responseId: "resp_a" },
        ])
      )
      .mockReturnValueOnce(createStream([{ type: "end" }]));
    const descriptor = createDescriptor({ provider: { name: "mock", stream: providerStream } });
    const dispatchHookOrThrow = vi.fn().mockResolvedValue({});
    const metrics = createMetrics();
    const applyTranscriptCompactionIfNeeded = vi.fn();

    const { runner } = createRunner({
      invocation,
      descriptor,
      dispatchHookOrThrow,
      metrics,
      applyTranscriptCompactionIfNeeded,
    });

    await runner.run();

    expect(metrics.observeToolCall).toHaveBeenCalledWith({
      name: "math",
      status: "error",
    });
    expect(metrics.countError).toHaveBeenCalledWith("tool.execution");
    expect(metrics.timeOperation).toHaveBeenCalledWith(
      "transcript.compaction",
      expect.any(Function)
    );
  });

  it("records agent stream errors", async () => {
    const invocation = createInvocation();
    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "error", message: "unavailable", cause: "overload" },
          { type: "end" },
        ])
      );
    const descriptor = createDescriptor({ provider: { name: "mock", stream: providerStream } });
    const metrics = createMetrics();

    const { runner } = createRunner({ invocation, descriptor, metrics });

    await runner.run();

    expect(metrics.countError).toHaveBeenCalledWith("agent.stream");
  });
});
