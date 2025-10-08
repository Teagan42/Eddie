import "reflect-metadata";
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import type {
  ChatMessage,
  PackedContext,
  ProviderAdapter,
  StreamEvent,
} from "@eddie/types";
import {
  AgentInvocationFactory,
  AgentOrchestratorService,
  type AgentRuntimeCatalog,
  type AgentRuntimeDescriptor,
  type AgentRuntimeOptions,
  type TranscriptCompactor,
} from "@eddie/engine";
import { ToolRegistryFactory } from "@eddie/tools";
import {
  JsonlWriterService,
  LoggerService,
  StreamRendererService,
} from "@eddie/io";
import { HookBus, HOOK_EVENTS, blockHook } from "@eddie/hooks";
import { TemplateRendererService } from "@eddie/templates";

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
  let agentInvocationFactory: AgentInvocationFactory;

  beforeEach(() => {
    const toolRegistryFactory = new ToolRegistryFactory();
    const templateRenderer = new TemplateRendererService();
    agentInvocationFactory = new AgentInvocationFactory(
      toolRegistryFactory,
      templateRenderer
    );
    renderer = new RecordingStreamRendererService();
    const traceWriter = new JsonlWriterService();
    orchestrator = new AgentOrchestratorService(
      agentInvocationFactory,
      renderer,
      traceWriter
    );
    loggerService = new LoggerService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    loggerService.reset();
  });

  type RuntimeOverrides = Partial<AgentRuntimeOptions> & {
    catalogDescriptors?: Record<string, AgentRuntimeDescriptor>;
    catalogEnableSubagents?: boolean;
    model?: string;
  };

  const createCatalog = (
    provider: ProviderAdapter,
    options: {
      model?: string;
      enableSubagents?: boolean;
      descriptors?: Record<string, AgentRuntimeDescriptor>;
    } = {}
  ): AgentRuntimeCatalog => {
    const descriptors = new Map<string, AgentRuntimeDescriptor>();
    const baseModel = options.model ?? "test-model";

    if (options.descriptors) {
      for (const [id, descriptor] of Object.entries(options.descriptors)) {
        descriptors.set(id, descriptor);
      }
    }

    if (!descriptors.has("manager")) {
      descriptors.set("manager", {
        id: "manager",
        definition: { id: "manager", systemPrompt: "coordinate" },
        provider,
        model: baseModel,
      });
    }

    const getOrCreate = (id: string): AgentRuntimeDescriptor => {
      const existing = descriptors.get(id);
      if (existing) {
        return existing;
      }

      const descriptor: AgentRuntimeDescriptor = {
        id,
        definition: { id, systemPrompt: `definition:${id}` },
        provider,
        model: baseModel,
      };
      descriptors.set(id, descriptor);
      return descriptor;
    };

    return {
      enableSubagents: options.enableSubagents ?? true,
      getManager: () => getOrCreate("manager"),
      getAgent: (id: string) => getOrCreate(id),
      getSubagent: (id: string) => (id === "manager" ? undefined : getOrCreate(id)),
      listSubagents: () =>
        Array.from(descriptors.entries())
          .filter(([key]) => key !== "manager")
          .map(([, descriptor]) => descriptor),
    };
  };

  const baseRuntime = (
    provider: ProviderAdapter,
    overrides: RuntimeOverrides = {}
  ): AgentRuntimeOptions => ({
    catalog:
      overrides.catalog ??
      createCatalog(provider, {
        model: overrides.model,
        enableSubagents: overrides.catalogEnableSubagents,
        descriptors: overrides.catalogDescriptors,
      }),
    hooks: overrides.hooks ?? new HookBus(),
    confirm: overrides.confirm ?? (async () => true),
    cwd: overrides.cwd ?? process.cwd(),
    logger: overrides.logger ?? loggerService.getLogger("test"),
    tracePath: overrides.tracePath,
    traceAppend: overrides.traceAppend,
    transcriptCompactor: overrides.transcriptCompactor,
  });

  const contextSlice = (text: string): PackedContext => ({
    files: [],
    totalBytes: text.length,
    text,
  });

  it("streams a single agent conversation", async () => {
    const createSpy = vi.spyOn(agentInvocationFactory, "create");
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
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it("allows a parent agent to spawn a subagent with independent context", async () => {
    const createSpy = vi.spyOn(agentInvocationFactory, "create");
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
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy.mock.calls[1]?.[2]).toBe(manager);
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
    hookBus.on(HOOK_EVENTS.beforeAgentStart, (payload) =>
      lifecycleEvents.push({ event: HOOK_EVENTS.beforeAgentStart, payload })
    );
    hookBus.on(HOOK_EVENTS.afterAgentComplete, (payload) =>
      lifecycleEvents.push({ event: HOOK_EVENTS.afterAgentComplete, payload })
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
      (entry) => entry.event === HOOK_EVENTS.beforeAgentStart
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
      (entry) => entry.event === HOOK_EVENTS.afterAgentComplete
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
    const traceWriter = new RecordingJsonlWriterService();
    orchestrator = new AgentOrchestratorService(
      agentInvocationFactory,
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
            outputSchema: {
              $id: "test.tools.echo.result",
              type: "object",
              properties: {
                text: { type: "string" },
              },
              required: ["text"],
              additionalProperties: false,
            },
            async handler(args) {
              const text = String((args as { text: string }).text);
              const payload = `echo:${text}`;
              return {
                schema: "test.tools.echo.result",
                content: payload,
                data: { text: payload },
              };
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
      result: {
        schema: "test.tools.echo.result",
        content: "echo:hi",
        data: { text: "echo:hi" },
      },
    });

    const toolMessage = invocation.messages.find(
      (message) => message.role === "tool"
    );
    expect(toolMessage).toBeDefined();
    const parsed = JSON.parse(toolMessage!.content);
    expect(parsed).toMatchObject({
      schema: "test.tools.echo.result",
      content: "echo:hi",
      data: { text: "echo:hi" },
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

    hookBus.on(HOOK_EVENTS.notification, (payload) =>
      recorded.push({ event: HOOK_EVENTS.notification, payload })
    );
    hookBus.on(HOOK_EVENTS.preToolUse, (payload) =>
      recorded.push({ event: HOOK_EVENTS.preToolUse, payload })
    );
    hookBus.on(HOOK_EVENTS.postToolUse, (payload) =>
      recorded.push({ event: HOOK_EVENTS.postToolUse, payload })
    );
    hookBus.on(HOOK_EVENTS.stop, (payload) =>
      recorded.push({ event: HOOK_EVENTS.stop, payload })
    );
    hookBus.on(HOOK_EVENTS.subagentStop, (payload) =>
      recorded.push({ event: HOOK_EVENTS.subagentStop, payload })
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
            outputSchema: {
              $id: "test.tools.echo.result",
              type: "object",
              properties: {
                text: { type: "string" },
              },
              required: ["text"],
              additionalProperties: false,
            },
            async handler(args) {
              const text = String((args as { text: string }).text);
              return {
                schema: "test.tools.echo.result",
                content: text,
                data: { text },
              };
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
      HOOK_EVENTS.notification,
      HOOK_EVENTS.preToolUse,
      HOOK_EVENTS.postToolUse,
      HOOK_EVENTS.notification,
      HOOK_EVENTS.stop,
      HOOK_EVENTS.subagentStop,
    ]);

    const notifications = recorded.filter(
      (entry) => entry.event === HOOK_EVENTS.notification
    );
    expect(notifications).toHaveLength(2);
    expect(
      notifications.map((entry) => entry.payload.event.payload.message)
    ).toEqual(["starting", "finishing"]);
    expect(notifications[1]?.payload.event.metadata).toMatchObject({
      severity: "info",
    });

    const postTool = recorded.find(
      (entry) => entry.event === HOOK_EVENTS.postToolUse
    );
    expect(postTool?.payload.result).toMatchObject({
      schema: "test.tools.echo.result",
      content: "child",
      data: { text: "child" },
    });

    const rootStop = recorded.find(
      (entry) =>
        entry.event === HOOK_EVENTS.stop &&
        entry.payload.metadata.id === "manager"
    );
    expect(rootStop).toBeTruthy();
  });

  it("surfaces tool failures as notifications and continues the conversation", async () => {
    const provider = new MockProvider([
      createStream([
        { type: "tool_call", name: "fail_tool", arguments: {}, id: "call-1" },
        { type: "end" },
      ]),
      createStream([
        { type: "delta", text: "Recovered" },
        { type: "end" },
      ]),
    ]);

    const notifications: StreamEvent[] = [];
    const agentErrors: Array<{ message: string }> = [];
    const hookBus = new HookBus();
    hookBus.on(HOOK_EVENTS.notification, (payload) => {
      notifications.push(payload.event);
    });
    hookBus.on(HOOK_EVENTS.onAgentError, (payload) => {
      agentErrors.push({ message: payload.error.message });
    });

    const runtime = baseRuntime(provider, { hooks: hookBus });

    const invocation = await orchestrator.runAgent(
      {
        definition: {
          id: "manager",
          systemPrompt: "coordinate",
          tools: [
            {
              name: "fail_tool",
              description: "always fails",
              jsonSchema: {
                type: "object",
                additionalProperties: false,
              },
              outputSchema: {
                $id: "test.tools.fail.result",
                type: "object",
                additionalProperties: false,
              },
              async handler() {
                throw new Error("boom");
              },
            },
          ],
        },
        prompt: "delegate work",
        context: contextSlice("ctx"),
      },
      runtime
    );

    expect(agentErrors).toHaveLength(0);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: "notification",
      payload: expect.stringContaining("Tool execution failed: boom"),
      metadata: {
        tool: "fail_tool",
        tool_call_id: "call-1",
        severity: "error",
      },
    });

    const toolMessage = invocation.messages.find(
      (message) =>
        message.role === "tool" && message.tool_call_id === "call-1"
    );
    expect(toolMessage?.content).toContain("Tool execution failed: boom");

    const finalMessage = invocation.messages.at(-1);
    expect(finalMessage).toMatchObject({
      role: "assistant",
      content: "Recovered",
    });

    const renderedNotification = renderer.events.find(
      (event) => event.type === "notification"
    );
    expect(renderedNotification).toEqual(notifications[0]);
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

    hookBus.on(HOOK_EVENTS.preToolUse, () => blockHook("policy veto"));
    hookBus.on(HOOK_EVENTS.postToolUse, () => {
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
              outputSchema: {
                $id: "test.tools.echo.result",
                type: "object",
                properties: {
                  text: { type: "string" },
                },
                required: ["text"],
                additionalProperties: false,
              },
              async handler() {
                toolExecuted = true;
                return {
                  schema: "test.tools.echo.result",
                  content: "should not run",
                  data: { text: "should not run" },
                };
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

  it("surfaces hook failures and stops tool execution", async () => {
    const provider = new MockProvider([
      createStream([
        {
          type: "tool_call",
          name: "echo",
          arguments: { text: "fail" },
          id: "call-1",
        },
      ]),
    ]);

    const hookBus = new HookBus();
    const agentErrors: Array<{ message: string }> = [];

    hookBus.on(HOOK_EVENTS.preToolUse, () => {
      throw new Error("pre-hook failure");
    });
    hookBus.on(HOOK_EVENTS.onAgentError, (payload) => {
      agentErrors.push({ message: payload.error.message });
    });

    let toolExecuted = false;

    const runtime = baseRuntime(provider, { hooks: hookBus });

    await expect(
      orchestrator.runAgent(
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
                },
                outputSchema: {
                  $id: "test.tools.echo.result",
                  type: "object",
                  properties: {
                    text: { type: "string" },
                  },
                  required: ["text"],
                  additionalProperties: false,
                },
                async handler() {
                  toolExecuted = true;
                  return {
                    schema: "test.tools.echo.result",
                    content: "should not run",
                    data: { text: "should not run" },
                  };
                },
              },
            ],
          },
          prompt: "delegate work",
          context: contextSlice("ctx"),
        },
        runtime
      )
    ).rejects.toThrow("pre-hook failure");

    expect(toolExecuted).toBe(false);
    expect(agentErrors).toHaveLength(1);
    expect(agentErrors[0]?.message).toContain("pre-hook failure");
  });

  it("emits PreCompact before applying transcript compaction", async () => {
    const provider = new MockProvider([
      createStream([
        { type: "delta", text: "compacted" },
        { type: "end" },
      ]),
    ]);

    const hookBus = new HookBus();
    const preCompactEvents: Array<{ beforeLength: number; reason?: string }> = [];
    let removedCount: number | undefined;
    hookBus.on(HOOK_EVENTS.preCompact, (payload) => {
      preCompactEvents.push({
        beforeLength: payload.messages.length,
        reason: payload.reason,
      });
    });

    const compactor: TranscriptCompactor = {
      async plan(invocation) {
        if (invocation.messages.length <= 3) {
          return null;
        }

        return {
          reason: "token_budget",
          async apply() {
            const before = invocation.messages.length;
            invocation.messages.splice(1, 1);
            removedCount = before - invocation.messages.length;
            return { removedMessages: removedCount };
          },
        };
      },
    };

    const history: ChatMessage[] = [
      { role: "user", content: "previous" },
      { role: "assistant", content: "ack" },
      { role: "user", content: "another" },
    ];

    const runtime = baseRuntime(provider, {
      hooks: hookBus,
      transcriptCompactor: compactor,
    });

    const invocation = await orchestrator.runAgent(
      {
        definition: {
          id: "manager",
          systemPrompt: "coordinate",
        },
        prompt: "delegate work",
        context: contextSlice("ctx"),
        history,
      },
      runtime
    );

    expect(preCompactEvents).toHaveLength(1);
    expect(preCompactEvents[0]?.beforeLength).toBeGreaterThan(3);
    expect(preCompactEvents[0]?.reason).toBe("token_budget");
    expect(removedCount).toBe(1);
  });
});
