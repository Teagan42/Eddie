import { vi } from "vitest";
import type { StreamEvent } from "@eddie/types";

import type { AgentInvocation } from "../../../src/agents/agent-invocation";
import {
  AgentRunner,
  type AgentRunnerDependencies,
  type AgentRunnerOptions,
} from "../../../src/agents/agent-runner";
import type { AgentRuntimeDescriptor } from "../../../src/agents/agent-runtime.types";
import type { AgentMemoryBinding } from "../../../src/memory/agent-memory-coordinator";

export type RunnerOptions = AgentRunnerOptions;
export type RunnerOverrides = Partial<RunnerOptions> & {
  runnerDependencies?: AgentRunnerDependencies;
  memoryBinding?: AgentMemoryBinding;
};
export type HookBusLike = RunnerOptions["hooks"];
export type StreamRendererLike = RunnerOptions["streamRenderer"];
export type EventBusLike = RunnerOptions["eventBus"];
export type MetricsLike = RunnerOptions["metrics"];

const baseDefinition = {
  id: "agent-1",
  systemPrompt: "You are helpful.",
  tools: [] as [] | undefined,
};

export const createStream = (events: StreamEvent[]): AsyncIterable<StreamEvent> => ({
  [Symbol.asyncIterator]: async function* () {
    for (const event of events) {
      yield event;
    }
  },
});

export const createInvocation = (
  overrides: Partial<AgentInvocation> = {}
): AgentInvocation => ({
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

export const createDescriptor = (
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

export const createMetrics = (): MetricsLike => ({
  countMessage: vi.fn(),
  observeToolCall: vi.fn(),
  countError: vi.fn(),
  timeOperation: vi.fn(async (_metric: string, fn: () => Promise<unknown>) => fn()),
  reset: vi.fn(),
  snapshot: vi.fn(() => ({ counters: {}, histograms: {} })),
} as unknown as MetricsLike);

interface AgentRunnerTestContext {
  runner: AgentRunner;
  invocation: AgentInvocation;
  descriptor: AgentRuntimeDescriptor;
  streamRenderer: StreamRendererLike;
  hooks: HookBusLike;
  metrics: MetricsLike;
  eventBus: EventBusLike;
  publish: ReturnType<typeof vi.fn>;
  writeTrace: RunnerOptions["writeTrace"];
  dispatchHookOrThrow: RunnerOptions["dispatchHookOrThrow"];
}

export const createAgentRunnerTestContext = (
  overrides: RunnerOverrides = {}
): AgentRunnerTestContext => {
  const invocation = overrides.invocation ?? createInvocation();
  const descriptor = overrides.descriptor ?? createDescriptor();
  const streamRenderer =
    overrides.streamRenderer ?? ({ render: vi.fn(), flush: vi.fn() } as StreamRendererLike);
  const publish = overrides.eventBus?.publish ?? vi.fn();
  const eventBus = overrides.eventBus ?? ({ publish } as EventBusLike);
  const hooks =
    overrides.hooks ?? ({ emitAsync: vi.fn().mockResolvedValue({}) } as HookBusLike);
  const metrics = overrides.metrics ?? createMetrics();
  const writeTrace = overrides.writeTrace ?? vi.fn();
  const dispatchHookOrThrow =
    overrides.dispatchHookOrThrow ?? (vi.fn().mockResolvedValue({}) as RunnerOptions["dispatchHookOrThrow"]);

  const runner = new AgentRunner({
    invocation,
    descriptor,
    streamRenderer,
    eventBus,
    hooks,
    logger:
      overrides.logger ??
      ({ warn: vi.fn(), error: vi.fn() } as RunnerOptions["logger"]),
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
    executeSpawnTool: overrides.executeSpawnTool ?? (vi.fn() as RunnerOptions["executeSpawnTool"]),
    applyTranscriptCompactionIfNeeded:
      overrides.applyTranscriptCompactionIfNeeded ?? vi.fn(),
    dispatchHookOrThrow,
    writeTrace,
    metrics,
    executionTreeTracker: overrides.executionTreeTracker,
    memoryBinding: overrides.memoryBinding,
  }, overrides.runnerDependencies);

  return {
    runner,
    invocation,
    descriptor,
    streamRenderer,
    hooks,
    metrics,
    eventBus,
    publish,
    writeTrace,
    dispatchHookOrThrow,
  };
};

