import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { Buffer } from "buffer";
import { Test } from "@nestjs/testing";
import type {
  AgentInvocationMemoryUsage,
  AgentRecalledMemory,
  AgentRuntimeDescriptor,
  ChatMessage,
  PackedContext,
} from "@eddie/types";
import {
  AgentInvocationFactory,
  EMPTY_RECALL_RESULT,
} from "../../src/agents/agent-invocation.factory";
import type { AgentDefinition } from "@eddie/types";
import { ToolRegistryFactory } from "@eddie/tools";
import { TemplateRuntimeService } from "@eddie/templates";
import type { AgentRuntimeOptions } from "../../src/agents/agent-orchestrator.service";
import type { ProviderAdapter } from "@eddie/types";

class TemplateRuntimeStub {
  renderSystemPrompt = vi.fn(async () => ({
    systemPrompt: "system",
    variables: { systemPrompt: "system" },
  }));

  renderUserPrompt = vi.fn(async () => "prompt");
}

class StubToolRegistryFactory {
  create = vi.fn(
    () => ({}) as ReturnType<ToolRegistryFactory["create"]>
  );
}

describe("AgentInvocationFactory", () => {
  let factory: AgentInvocationFactory;
  let templateRuntime: TemplateRuntimeStub;
  let toolRegistryFactory: StubToolRegistryFactory;

  it("exposes empty recall result for reuse", () => {
    expect(EMPTY_RECALL_RESULT).toEqual({ memories: [], usage: [] });
    expectTypeOf<typeof EMPTY_RECALL_RESULT>().toMatchTypeOf<{
      memories: AgentRecalledMemory[];
      usage: AgentInvocationMemoryUsage[];
      appendText?: string;
      appendBytes?: number;
    }>();
  });

  const createRuntime = (
    descriptor: AgentRuntimeDescriptor,
    overrides: Partial<AgentRuntimeOptions> = {}
  ): AgentRuntimeOptions => ({
    catalog: {
      enableSubagents: false,
      getAgent: vi.fn(() => descriptor),
      getManager: vi.fn(() => descriptor),
      getSubagent: vi.fn(() => descriptor),
      listSubagents: vi.fn(() => [descriptor]),
      listSpawnableSubagents: vi.fn(() => [descriptor]),
    },
    hooks: {} as AgentRuntimeOptions["hooks"],
    confirm: vi.fn(async () => true),
    cwd: process.cwd(),
    logger: {
      child: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      level: "info",
    } as unknown as AgentRuntimeOptions["logger"],
    metrics: {
      countTool: vi.fn(),
      countMessage: vi.fn(),
      countError: vi.fn(),
    } as unknown as AgentRuntimeOptions["metrics"],
    ...overrides,
  });

  beforeEach(async () => {
    templateRuntime = new TemplateRuntimeStub();
    toolRegistryFactory = new StubToolRegistryFactory();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgentInvocationFactory,
        { provide: TemplateRuntimeService, useValue: templateRuntime },
        { provide: ToolRegistryFactory, useValue: toolRegistryFactory },
      ],
    }).compile();

    const runtime = moduleRef.get(TemplateRuntimeService);
    const tools = moduleRef.get(ToolRegistryFactory);

    factory = new AgentInvocationFactory(
      tools as unknown as ToolRegistryFactory,
      runtime
    );
  });

  it("does not leak context or history mutations across invocations", async () => {
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "Be helpful.",
    };

    const sharedContext: PackedContext = {
      files: [],
      totalBytes: 0,
      text: "initial context",
    };

    const sharedHistory: ChatMessage[] = [
      { role: "assistant", content: "initial reply" },
    ];

    const descriptor: AgentRuntimeDescriptor = {
      id: "planner",
      definition,
      model: "gpt-test",
      provider: {} as ProviderAdapter,
    };

    const runtime = createRuntime(descriptor);

    const firstInvocation = await factory.create(
      definition,
      {
        prompt: "Plan work",
        context: sharedContext,
        history: sharedHistory,
      },
      runtime
    );

    firstInvocation.context.text = "first invocation context";
    firstInvocation.history[0]!.content = "first invocation reply";

    const secondInvocation = await factory.create(
      definition,
      {
        prompt: "Plan work",
        context: sharedContext,
        history: sharedHistory,
      },
      runtime
    );

    expect(secondInvocation.context.text).toBe("initial context");
    expect(secondInvocation.history[0]?.content).toBe("initial reply");
    expect(secondInvocation.messages[1]?.content).toBe("initial reply");
  });

  it("recalls memories for opt-in agents and records usage", async () => {
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "System",
    };

    const memoryText = "Remember the sprint goal";

    const descriptor: AgentRuntimeDescriptor = {
      id: "planner",
      definition,
      model: "gpt-4",
      provider: {} as ProviderAdapter,
      metadata: {
        memory: { recall: true },
      },
    };

    const memoryAdapter = {
      recallMemories: vi.fn(async () => [
        {
          id: "mem-1",
          memory: memoryText,
          facets: { project: "apollo" },
        },
      ]),
    };

    const runtime = createRuntime(descriptor, {
      sessionId: "session-123",
      memory: {
        adapter: memoryAdapter,
        session: { id: "session-123" },
      },
    });

    const invocation = await factory.create(
      definition,
      { prompt: "Plan the sprint" },
      runtime
    );

    expect(memoryAdapter.recallMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: descriptor,
        query: "Plan the sprint",
        session: { id: "session-123" },
        maxBytes: undefined,
      })
    );

    expect(templateRuntime.renderSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        memories: [
          expect.objectContaining({ id: "mem-1", memory: "Remember the sprint goal" }),
        ],
      })
    );

    expect(invocation.memoryUsage).toEqual([
      {
        id: "mem-1",
        facets: { project: "apollo" },
        metadata: undefined,
        bytes: Buffer.byteLength(memoryText, "utf8"),
      },
    ]);
  });

  it("merges runtime and agent memory metadata when recalling", async () => {
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "System",
    };

    const descriptor: AgentRuntimeDescriptor = {
      id: "planner",
      definition,
      model: "gpt-4",
      provider: {} as ProviderAdapter,
      metadata: {
        memory: {
          recall: true,
          facets: {
            defaultStrategy: "semantic",
          },
        },
      },
    };

    const memoryAdapter = {
      recallMemories: vi.fn(async () => []),
    };

    const runtime = createRuntime(descriptor, {
      sessionId: "session-123",
      memory: {
        adapter: memoryAdapter,
        session: { id: "session-123" },
        metadata: {
          workspace: "apollo",
        },
      },
    });

    await factory.create(
      definition,
      { prompt: "Plan the sprint" },
      runtime,
    );

    expect(memoryAdapter.recallMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          workspace: "apollo",
          facets: {
            defaultStrategy: "semantic",
          },
        },
      }),
    );
  });

  it("omits fallback session metadata when runtime does not provide it", async () => {
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "System",
    };

    const descriptor: AgentRuntimeDescriptor = {
      id: "planner",
      definition,
      model: "gpt-4",
      provider: {} as ProviderAdapter,
      metadata: {
        memory: { recall: true },
      },
    };

    const memoryAdapter = {
      recallMemories: vi.fn(async () => [] as AgentRecalledMemory[]),
    };

    const runtime = createRuntime(descriptor, {
      sessionId: "session-123",
      memory: {
        adapter: memoryAdapter,
      },
    });

    await factory.create(definition, { prompt: "Plan the sprint" }, runtime);

    expect(memoryAdapter.recallMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        session: undefined,
      })
    );
  });

  it("appends recalled memories to the agent context when within budget", async () => {
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "System",
      context: {
        files: [],
        text: "workspace summary",
        totalBytes: Buffer.byteLength("workspace summary", "utf8"),
      },
    };

    const descriptor: AgentRuntimeDescriptor = {
      id: "planner",
      definition,
      model: "gpt-4",
      provider: {} as ProviderAdapter,
      metadata: {
        memory: { recall: true },
      },
    };

    const memoryAdapter = {
      recallMemories: vi.fn(async () => [
        { id: "mem-1", memory: "Remember the sprint goal" },
        { id: "mem-2", memory: "Coordinate with QA before release" },
      ]),
    };

    const runtime = createRuntime(descriptor, {
      sessionId: "session-789",
      contextMaxBytes: 500,
      memory: {
        adapter: memoryAdapter,
        session: { id: "session-789" },
      },
    });

    const invocation = await factory.create(
      definition,
      { prompt: "Plan the sprint" },
      runtime,
    );

    const appendedBlock = "\n\n<recalled_memories>\nRemember the sprint goal\nCoordinate with QA before release\n</recalled_memories>";

    expect(invocation.context.text).toBe(
      `${definition.context!.text}${appendedBlock}`,
    );

    expect(invocation.context.totalBytes).toBe(
      definition.context!.totalBytes + Buffer.byteLength(appendedBlock, "utf8"),
    );

    const userMessage = invocation.messages.at(-1);
    expect(userMessage?.content).toContain("<recalled_memories>");
    expect(userMessage?.content).toContain("Coordinate with QA before release");
  });

  it("creates an invocation when runtime options are omitted", async () => {
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "System",
    };

    const invocation = await factory.create(
      definition,
      { prompt: "Plan the sprint" },
      undefined as unknown as AgentRuntimeOptions,
    );

    expect(invocation.definition.systemPrompt).toBe("system");
    expect(invocation.messages[1]?.content).toBe("prompt");
    expect(invocation.context.text).toBe("");
  });

  it("drops recalled memories that exceed the remaining context budget", async () => {
    const baseContextText = "";
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "System",
      context: {
        files: [],
        totalBytes: Buffer.byteLength(baseContextText, "utf8"),
        text: baseContextText,
      },
    };

    const descriptor: AgentRuntimeDescriptor = {
      id: "planner",
      definition,
      model: "gpt-4",
      provider: {} as ProviderAdapter,
      metadata: {
        memory: { recall: true },
      },
    };

    const memoryText = "Remember the sprint goal";
    const memoryAdapter = {
      recallMemories: vi.fn(async () => [
        { id: "mem-1", memory: memoryText },
        { id: "mem-2", memory: "Coordinate with QA before release" },
      ]),
    };

    const runtime = createRuntime(descriptor, {
      sessionId: "session-456",
      contextMaxBytes: 80,
      memory: {
        adapter: memoryAdapter,
        session: { id: "session-456" },
      },
    });

    const invocation = await factory.create(
      definition,
      { prompt: "Plan the sprint" },
      runtime
    );

    expect(memoryAdapter.recallMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        maxBytes: 80,
      })
    );

    const appendedBlock = "<recalled_memories>\nRemember the sprint goal\n</recalled_memories>";

    expect(templateRuntime.renderSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        memories: [
          expect.objectContaining({ id: "mem-1" }),
        ],
      })
    );

    expect(invocation.context.text).toBe(appendedBlock);
    expect(invocation.context.totalBytes).toBe(
      definition.context!.totalBytes + Buffer.byteLength(appendedBlock, "utf8"),
    );

    expect(invocation.memoryUsage).toEqual([
      {
        id: "mem-1",
        metadata: undefined,
        facets: undefined,
        bytes: Buffer.byteLength(memoryText, "utf8"),
      },
    ]);
  });
});
