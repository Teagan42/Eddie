import "reflect-metadata";
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import type { StreamEvent, ProviderAdapter, PackedContext } from "../../../../src/core/types";
import { AgentOrchestratorService, type AgentRuntimeOptions } from "../../../../src/core/agents";
import { ToolRegistryFactory } from "../../../../src/core/tools";
import { JsonlWriterService, StreamRendererService, LoggerService } from "../../../../src/io";
import { HookBus } from "../../../../src/hooks";

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

  const baseRuntime = (provider: ProviderAdapter): AgentRuntimeOptions => ({
    provider,
    model: "test-model",
    hooks: new HookBus(),
    confirm: async () => true,
    cwd: process.cwd(),
    logger: loggerService.getLogger("test"),
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
});
