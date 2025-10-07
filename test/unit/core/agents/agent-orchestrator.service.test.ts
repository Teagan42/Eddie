import "reflect-metadata";
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import type { StreamEvent, ProviderAdapter, PackedContext } from "../../../../src/core/types";
import { AgentOrchestratorService, type AgentRuntimeOptions } from "../../../../src/core/agents";
import { ToolRegistryFactory } from "../../../../src/core/tools";
import { JsonlWriterService, StreamRendererService, LoggerService } from "../../../../src/io";
import { HookBus, blockHook } from "../../../../src/hooks";

class RecordingStreamRendererService extends StreamRendererService {
  readonly events: StreamEvent[] = [];
  flushCount = 0;

  override render(event: StreamEvent): void {
    this.events.push(event);
  }

  override flush(): void {
    this.flushCount += 1;
  }
}

class RecordingJsonlWriterService extends JsonlWriterService {
  readonly writes: Array<{ filePath: string; event: unknown; append: boolean }> = [];

  override async write(
    filePath: string,
    event: unknown,
    append = true
  ): Promise<void> {
    this.writes.push({ filePath, event, append });
  }
}

class MockProvider implements ProviderAdapter {
  readonly name = "mock";
  private readonly streams: AsyncIterable<StreamEvent>[];

  constructor(streams: AsyncIterable<StreamEvent>[]) {
    this.streams = [...streams];
  }

  stream(): AsyncIterable<StreamEvent> {
    const next = this.streams.shift();
    if (!next) {
      throw new Error("No mock stream configured");
    }
    return next;
  }
}

function createStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

describe("AgentOrchestratorService", () => {
  let orchestrator: AgentOrchestratorService;
  let renderer: RecordingStreamRendererService;
  let loggerService: LoggerService;

  beforeEach(() => {
    const toolRegistryFactory = new ToolRegistryFactory();
    renderer = new RecordingStreamRendererService();
    const traceWriter = new JsonlWriterService();
    orchestrator = new AgentOrchestratorService(
      toolRegistryFactory,
      renderer,
      traceWriter
    );
    loggerService = new LoggerService();
  });

  afterEach(() => {
    loggerService.reset();
  });

  const baseRuntime = (
    provider: ProviderAdapter,
    overrides: Partial<AgentRuntimeOptions> = {}
  ): AgentRuntimeOptions => ({
    provider,
    model: overrides.model ?? "test-model",
    hooks: overrides.hooks ?? new HookBus(),
    confirm: overrides.confirm ?? (async () => true),
    cwd: overrides.cwd ?? process.cwd(),
    logger: overrides.logger ?? loggerService.getLogger("test"),
    tracePath: overrides.tracePath,
    traceAppend: overrides.traceAppend,
  });

  const contextSlice = (text: string): PackedContext => ({
    files: [],
    totalBytes: text.length,
    text,
  });

  it("streams a single agent conversation", async () => {
    const provider = new MockProvider([
      createStream([
        { type: "delta", text: "partial" },
        { type: "delta", text: " response" },
        { type: "end" },
      ]),
    ]);

    const runtime = baseRuntime(provider);
    const invocation = await orchestrator.runAgent(
      {
        definition: {
          id: "manager",
          systemPrompt: "be helpful",
        },
        prompt: "Do the thing",
        context: contextSlice("context"),
      },
      runtime
    );

    expect(invocation.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
    ]);
    expect(invocation.messages.at(-1)?.content).toBe("partial response");
    expect(renderer.events.map((event) => event.type)).toEqual(["delta", "delta", "end"]);
  });

  it("allows a parent agent to spawn a subagent with independent context", async () => {
    const provider = new MockProvider([
      createStream([
        { type: "delta", text: "manager" },
        { type: "end" },
      ]),
      createStream([
        { type: "delta", text: "sub" },
        { type: "end" },
      ]),
    ]);

    const runtime = baseRuntime(provider);
    const manager = await orchestrator.runAgent(
      {
        definition: {
          id: "manager",
          systemPrompt: "coordinate",
        },
        prompt: "delegate work",
        context: contextSlice("root"),
      },
      runtime
    );

    const worker = await manager.spawn(
      {
        id: "worker",
        systemPrompt: "execute",
      },
      {
        prompt: "do task",
        context: contextSlice("slice"),
      }
    );

    const flattened = orchestrator.collectInvocations(manager);
    expect(flattened.map((agent) => agent.id)).toEqual(["manager", "worker"]);
    expect(manager.messages.at(-1)?.content).toBe("manager");
    expect(worker.messages.at(-1)?.content).toBe("sub");
    expect(worker.messages.find((m) => m.role === "user")?.content).toContain("slice");
    expect(renderer.flushCount).toBe(1);
  });

  it("emits lifecycle hooks with metadata for nested agents", async () => {
    const provider = new MockProvider([
      createStream([
        { type: "delta", text: "manager" },
        { type: "end" },
      ]),
      createStream([
        { type: "delta", text: "worker" },
        { type: "end" },
      ]),
    ]);

    const hookBus = new HookBus();
    const lifecycleEvents: Array<{ event: string; payload: any }> = [];
    hookBus.on("beforeAgentStart", (payload) =>
      lifecycleEvents.push({ event: "beforeAgentStart", payload })
    );
    hookBus.on("afterAgentComplete", (payload) =>
      lifecycleEvents.push({ event: "afterAgentComplete", payload })
    );

    const runtime = baseRuntime(provider, { hooks: hookBus });
    const manager = await orchestrator.runAgent(
      {
        definition: {
          id: "manager",
          systemPrompt: "coordinate",
        },
        prompt: "delegate work",
        context: contextSlice("root"),
      },
      runtime
    );

    await manager.spawn(
      {
        id: "worker",
        systemPrompt: "execute",
      },
      {
        prompt: "do task",
        context: contextSlice("slice"),
      }
    );

    const startEvents = lifecycleEvents.filter(
      (entry) => entry.event === "beforeAgentStart"
    );
    expect(startEvents.map((entry) => entry.payload.metadata.id)).toEqual([
      "manager",
      "worker",
    ]);
    expect(startEvents[1]?.payload.metadata.parentId).toBe("manager");
    expect(startEvents[1]?.payload.metadata.depth).toBe(1);
    expect(startEvents[0]?.payload.metadata.isRoot).toBe(true);
    expect(startEvents[1]?.payload.metadata.isRoot).toBe(false);
    expect(startEvents[0]?.payload.context.totalBytes).toBe("root".length);
    expect(startEvents[1]?.payload.context.totalBytes).toBe("slice".length);

    const completeEvents = lifecycleEvents.filter(
      (entry) => entry.event === "afterAgentComplete"
    );
    expect(completeEvents.map((entry) => entry.payload.metadata.id)).toEqual([
      "manager",
      "worker",
    ]);
    expect(
      completeEvents.every((entry) => entry.payload.iterations === 1)
    ).toBe(true);
  });

  it("writes trace records for agent phases with metadata", async () => {
    const toolRegistryFactory = new ToolRegistryFactory();
    const traceWriter = new RecordingJsonlWriterService();
    orchestrator = new AgentOrchestratorService(
      toolRegistryFactory,
      renderer,
      traceWriter
    );

    const provider = new MockProvider([
      createStream([
        {
          type: "tool_call",
          name: "echo",
          arguments: { text: "hi" },
          id: "call-1",
        },
      ]),
      createStream([
        { type: "delta", text: "done" },
        { type: "end" },
      ]),
    ]);

    const runtime = baseRuntime(provider, {
      tracePath: "/tmp/trace.jsonl",
      traceAppend: false,
    });

    const invocation = await orchestrator.runAgent(
      {
        definition: {
          id: "manager",
          systemPrompt: "coordinate",
          tools: [
            {
              name: "echo",
              description: "echo tool",
              jsonSchema: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
              },
              async handler(args) {
                const text = String((args as { text: string }).text);
                return { content: `echo:${text}` };
              },
            },
          ],
        },
        prompt: "delegate work",
        context: contextSlice("ctx"),
      },
      runtime
    );

    expect(traceWriter.writes.length).toBe(7);
    expect(traceWriter.writes[0]?.append).toBe(false);
    expect(
      traceWriter.writes.slice(1).every((write) => write.append === true)
    ).toBe(true);

    const phases = traceWriter.writes.map(
      (write) => (write.event as { phase: string }).phase
    );
    expect(phases).toEqual([
      "agent_start",
      "model_call",
      "tool_call",
      "tool_result",
      "model_call",
      "iteration_complete",
      "agent_complete",
    ]);

    const startRecord = traceWriter.writes[0]?.event as any;
    expect(startRecord.agent).toMatchObject({
      id: "manager",
      parentId: undefined,
      tools: ["echo"],
    });
    expect(startRecord.prompt).toBe("delegate work");
    expect(startRecord.context).toMatchObject({ totalBytes: "ctx".length });

    const toolCallRecord = traceWriter.writes.find(
      (write) => (write.event as any).phase === "tool_call"
    )?.event as any;
    expect(toolCallRecord.data).toMatchObject({
      iteration: 1,
      name: "echo",
      arguments: { text: "hi" },
    });

    const toolResultRecord = traceWriter.writes.find(
      (write) => (write.event as any).phase === "tool_result"
    )?.event as any;
    expect(toolResultRecord.data).toMatchObject({
      name: "echo",
      result: "echo:hi",
    });

    const completeRecord = traceWriter.writes.at(-1)?.event as any;
    expect(completeRecord.data).toMatchObject({
      iterations: 2,
      messageCount: invocation.messages.length,
    });
  });

  it("emits notification and tool lifecycle hooks in order", async () => {
    const provider = new MockProvider([
      createStream([
        { type: "delta", text: "manager" },
        { type: "end" },
      ]),
      createStream([
        { type: "notification", payload: { message: "starting" } },
        {
          type: "tool_call",
          name: "echo",
          arguments: { text: "child" },
          id: "call-1",
        },
      ]),
      createStream([
        {
          type: "notification",
          payload: { message: "finishing" },
          metadata: { severity: "info" },
        },
        { type: "delta", text: "child done" },
        { type: "end" },
      ]),
    ]);

    const hookBus = new HookBus();
    const recorded: Array<{ event: string; payload: any }> = [];

    hookBus.on("Notification", (payload) =>
      recorded.push({ event: "Notification", payload })
    );
    hookBus.on("PreToolUse", (payload) =>
      recorded.push({ event: "PreToolUse", payload })
    );
    hookBus.on("PostToolUse", (payload) =>
      recorded.push({ event: "PostToolUse", payload })
    );
    hookBus.on("Stop", (payload) => recorded.push({ event: "Stop", payload }));
    hookBus.on("SubagentStop", (payload) =>
      recorded.push({ event: "SubagentStop", payload })
    );

    const runtime = baseRuntime(provider, { hooks: hookBus });
    const manager = await orchestrator.runAgent(
      {
        definition: {
          id: "manager",
          systemPrompt: "coordinate",
        },
        prompt: "delegate work",
        context: contextSlice("root"),
      },
      runtime
    );

    await manager.spawn(
      {
        id: "worker",
        systemPrompt: "execute",
        tools: [
          {
            name: "echo",
            description: "echo tool",
            jsonSchema: {
              type: "object",
              properties: { text: { type: "string" } },
            },
            async handler(args) {
              const text = String((args as { text: string }).text);
              return { content: text };
            },
          },
        ],
      },
      {
        prompt: "do task",
        context: contextSlice("slice"),
      }
    );

    const childEvents = recorded
      .filter((entry) => entry.payload.metadata.id === "worker")
      .map((entry) => entry.event);

    expect(childEvents).toEqual([
      "Notification",
      "PreToolUse",
      "PostToolUse",
      "Notification",
      "Stop",
      "SubagentStop",
    ]);

    const notifications = recorded.filter(
      (entry) => entry.event === "Notification"
    );
    expect(notifications).toHaveLength(2);
    expect(
      notifications.map((entry) => entry.payload.event.payload.message)
    ).toEqual(["starting", "finishing"]);
    expect(notifications[1]?.payload.event.metadata).toMatchObject({
      severity: "info",
    });

    const rootStop = recorded.find(
      (entry) => entry.event === "Stop" && entry.payload.metadata.id === "manager"
    );
    expect(rootStop).toBeTruthy();
  });

  it("skips tool execution when a PreToolUse hook vetoes the call", async () => {
    const provider = new MockProvider([
      createStream([
        {
          type: "tool_call",
          name: "echo",
          arguments: { text: "blocked" },
          id: "call-1",
        },
      ]),
      createStream([
        { type: "delta", text: "fallback" },
        { type: "end" },
      ]),
    ]);

    const hookBus = new HookBus();
    let postToolInvocations = 0;

    hookBus.on("PreToolUse", () => blockHook("policy veto"));
    hookBus.on("PostToolUse", () => {
      postToolInvocations += 1;
    });

    let toolExecuted = false;

    const runtime = baseRuntime(provider, { hooks: hookBus });
    const invocation = await orchestrator.runAgent(
      {
        definition: {
          id: "manager",
          systemPrompt: "coordinate",
          tools: [
            {
              name: "echo",
              description: "echo tool",
              jsonSchema: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
              },
              async handler() {
                toolExecuted = true;
                return { content: "should not run" };
              },
            },
          ],
        },
        prompt: "delegate work",
        context: contextSlice("ctx"),
      },
      runtime
    );

    expect(toolExecuted).toBe(false);
    expect(postToolInvocations).toBe(0);

    const toolMessage = invocation.messages.find(
      (message) =>
        message.role === "tool" &&
        message.name === "echo" &&
        message.tool_call_id === "call-1"
    );

    expect(toolMessage?.content).toBe("policy veto");
    expect(invocation.messages.at(-1)?.content).toBe("fallback");
  });
});
