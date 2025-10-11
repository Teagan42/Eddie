import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import {
  AgentInvocation,
  EngineService,
  type AgentOrchestratorService,
  type AgentRunRequest,
  type AgentRuntimeCatalog,
  type AgentRuntimeDescriptor,
  type AgentRuntimeOptions,
} from "@eddie/engine";
import {
  ConfigService,
  ConfigStore,
  type EddieConfig,
  type ProviderConfig,
} from "@eddie/config";
import type { ContextService } from "@eddie/context";
import type { ProviderFactoryService } from "@eddie/providers";
import {
  HookBus,
  HOOK_EVENTS,
  blockHook,
  type HooksService,
} from "@eddie/hooks";
import {
  LoggerService,
  type ConfirmService,
} from "@eddie/io";
import { ToolRegistryFactory } from "@eddie/tools";
import type { TokenizerService } from "@eddie/tokenizers";
import type { McpToolSourceService } from "@eddie/mcp";
import type {
  ChatMessage,
  PackedContext,
  ProviderAdapter,
  ToolDefinition,
} from "@eddie/types";

class FakeAgentOrchestrator {
  shouldFail = false;
  lastRuntime?: AgentRuntimeOptions;
  private readonly tools = new ToolRegistryFactory();

  async runAgent(
    request: AgentRunRequest,
    runtime: AgentRuntimeOptions
  ): Promise<AgentInvocation> {
    this.lastRuntime = runtime;
    if (this.shouldFail) {
      throw new Error("orchestrator failed");
    }

    const invocation = new AgentInvocation(
      request.definition,
      {
        prompt: request.prompt,
        context: request.context,
        history: request.history,
      },
      this.tools,
      request.parent
    );

    invocation.messages.push({ role: "assistant", content: "stubbed" });
    return invocation;
  }

  collectInvocations(root: AgentInvocation): AgentInvocation[] {
    return [root];
  }
}

interface EngineHarness {
  engine: EngineService;
  hookBus: HookBus;
  config: EddieConfig;
  context: PackedContext;
  fakeOrchestrator: FakeAgentOrchestrator;
  contextPackSpy: ReturnType<typeof vi.fn>;
  store: ConfigStore;
}

function createEngineHarness(
  overrides?: { orchestratorShouldFail?: boolean }
): EngineHarness {
  const config: EddieConfig = {
    model: "gpt-test",
    provider: { name: "test-provider" },
    context: { include: [], baseDir: process.cwd() },
    systemPrompt: "system",
    logLevel: "info",
    logging: { level: "info" },
    output: {},
    tools: {},
    hooks: {},
    tokenizer: {},
    agents: {
      mode: "manager",
      manager: { prompt: "be helpful" },
      subagents: [],
      enableSubagents: false,
    },
  };

  const context: PackedContext = {
    files: [],
    totalBytes: 42,
    text: "context payload",
  };

  const hookBus = new HookBus();

  const store = new ConfigStore();
  store.setSnapshot(config);

  const configService = {
    load: vi.fn(async () => {
      store.setSnapshot(config);
      return config;
    }),
  } as unknown as ConfigService;

  const contextPackSpy = vi.fn(async () => context);
  const contextService = {
    pack: contextPackSpy,
  } as unknown as ContextService;

  const providerFactory = {
    create: vi.fn((config: ProviderConfig): ProviderAdapter => ({
      name: config.name,
      stream: vi.fn(),
    })),
  } as unknown as ProviderFactoryService;

  const hooksService = {
    load: vi.fn(async () => hookBus),
  } as unknown as HooksService;

  const confirmService = {
    create: vi.fn(() => async () => true),
  } as unknown as ConfirmService;

  const tokenizerService = {
    create: vi.fn(() => ({
      countTokens: (text: string) => text.length,
    })),
  } as unknown as TokenizerService;

  const loggerService = new LoggerService();
  const mcpToolSourceService = {
    collectTools: vi.fn(async () => ({ tools: [], resources: [], prompts: [] })),
  } as unknown as McpToolSourceService;

  const fakeOrchestrator = new FakeAgentOrchestrator();
  if (overrides?.orchestratorShouldFail) {
    fakeOrchestrator.shouldFail = true;
  }

  const engine = new EngineService(
    configService,
    store,
    contextService,
    providerFactory,
    hooksService,
    confirmService,
    tokenizerService,
    loggerService,
    fakeOrchestrator as unknown as AgentOrchestratorService,
    mcpToolSourceService
  );

  return {
    engine,
    hookBus,
    config,
    context,
    fakeOrchestrator,
    contextPackSpy,
    store,
  };
}

describe("EngineService hooks", () => {
  it("emits session lifecycle hooks with metadata", async () => {
    const harness = createEngineHarness();
    const events: Array<{ event: string; payload: any }> = [];

    harness.hookBus.on(HOOK_EVENTS.sessionStart, (payload) =>
      events.push({ event: HOOK_EVENTS.sessionStart, payload })
    );
    harness.hookBus.on(HOOK_EVENTS.userPromptSubmit, (payload) =>
      events.push({ event: HOOK_EVENTS.userPromptSubmit, payload })
    );
    harness.hookBus.on(HOOK_EVENTS.sessionEnd, (payload) =>
      events.push({ event: HOOK_EVENTS.sessionEnd, payload })
    );

    const history: ChatMessage[] = [{ role: "user", content: "earlier" }];
    const result = await harness.engine.run("Execute plan", { history });

    expect(events.map((entry) => entry.event)).toEqual([
      HOOK_EVENTS.sessionStart,
      HOOK_EVENTS.userPromptSubmit,
      HOOK_EVENTS.sessionEnd,
    ]);

    const start = events[0]?.payload;
    expect(start.metadata.prompt).toBe("Execute plan");
    expect(start.metadata.provider).toBe(harness.config.provider.name);
    expect(start.metadata.model).toBe(harness.config.model);

    const submit = events[1]?.payload;
    expect(submit.historyLength).toBe(1);
    expect(submit.prompt).toBe("Execute plan");

    const end = events[2]?.payload;
    expect(end.status).toBe("success");
    expect(end.result).toMatchObject({
      messageCount: result.messages.length,
      agentCount: 1,
      contextBytes: harness.context.totalBytes,
    });
    expect(end.error).toBeUndefined();

    expect(harness.fakeOrchestrator.lastRuntime?.hooks).toBe(harness.hookBus);
  });

  it("emits sessionEnd with error details when orchestration fails", async () => {
    const harness = createEngineHarness({ orchestratorShouldFail: true });
    const events: Array<{ event: string; payload: any }> = [];

    harness.hookBus.on(HOOK_EVENTS.sessionStart, (payload) =>
      events.push({ event: HOOK_EVENTS.sessionStart, payload })
    );
    harness.hookBus.on(HOOK_EVENTS.userPromptSubmit, (payload) =>
      events.push({ event: HOOK_EVENTS.userPromptSubmit, payload })
    );
    harness.hookBus.on(HOOK_EVENTS.sessionEnd, (payload) =>
      events.push({ event: HOOK_EVENTS.sessionEnd, payload })
    );

    await expect(harness.engine.run("Failing run"))
      .rejects.toThrow("orchestrator failed");

    expect(events.map((entry) => entry.event)).toEqual([
      HOOK_EVENTS.sessionStart,
      HOOK_EVENTS.userPromptSubmit,
      HOOK_EVENTS.sessionEnd,
    ]);

    const end = events.at(-1)?.payload;
    expect(end.status).toBe("error");
    expect(end.error?.message).toBe("orchestrator failed");
    expect(end.result).toBeUndefined();
  });

  it("rejects when a hook listener fails and surfaces the hook error", async () => {
    const harness = createEngineHarness();
    harness.hookBus.on(HOOK_EVENTS.sessionStart, () => {
      throw new Error("hook boom");
    });

    await expect(harness.engine.run("hook failure"))
      .rejects.toMatchObject({
        message: 'Hook "sessionStart" failed: hook boom',
        cause: expect.objectContaining({ message: "hook boom" }),
      });
  });

  it("aborts the run when a hook blocks a critical event", async () => {
    const harness = createEngineHarness();
    harness.hookBus.on(
      HOOK_EVENTS.beforeContextPack,
      () => blockHook("policy veto")
    );

    await expect(harness.engine.run("blocked"))
      .rejects.toThrow("policy veto");
    expect(harness.contextPackSpy).not.toHaveBeenCalled();
  });
});

describe("EngineService tool filtering", () => {
  const invokeFilter = (
    engine: EngineService,
    available: ToolDefinition[],
    enabled?: string[],
    disabled?: string[]
  ) =>
    (engine as unknown as {
      filterTools(
        available: ToolDefinition[],
        enabled?: string[],
        disabled?: string[]
      ): ToolDefinition[];
    }).filterTools(available, enabled, disabled);

  const tool = (name: string): ToolDefinition =>
    ({
      name,
      jsonSchema: {},
      handler: vi.fn(),
    } as unknown as ToolDefinition);

  it("removes disabled tools from the available set", () => {
    const { engine } = createEngineHarness();
    const available = [tool("bash"), tool("write"), tool("lint")];

    const filtered = invokeFilter(engine, available, undefined, ["write"]);

    expect(filtered.map((entry) => entry.name)).toEqual(["bash", "lint"]);
  });

  it("honours both enabled and disabled selections", () => {
    const { engine } = createEngineHarness();
    const available = [tool("bash"), tool("write"), tool("lint")];

    const filtered = invokeFilter(engine, available, ["bash", "write"], ["write"]);

    expect(filtered.map((entry) => entry.name)).toEqual(["bash"]);
  });
});

describe("EngineService agent catalog", () => {
  it("selects manager provider profiles when configured", async () => {
    const harness = createEngineHarness();
    harness.config.providers = {
      alt: {
        provider: { name: "alt" },
        model: "alt-model",
      },
    };
    harness.config.agents.manager.provider = "alt";
    harness.store.setSnapshot(harness.config);

    const events: SessionMetadata[] = [];
    harness.hookBus.on(HOOK_EVENTS.sessionStart, (payload) => {
      events.push(payload.metadata);
    });

    await harness.engine.run("Profiled run");

    expect(events[0]?.provider).toBe("alt");
    expect(events[0]?.model).toBe("alt-model");

    const runtime = harness.fakeOrchestrator.lastRuntime;
    expect(runtime?.catalog.getManager().provider.name).toBe("alt");
    expect(runtime?.catalog.getManager().model).toBe("alt-model");
  });

  it("builds catalog entries for configured subagents", async () => {
    const harness = createEngineHarness();
    harness.config.agents.enableSubagents = true;
    harness.config.agents.subagents = [
      {
        id: "reviewer",
        prompt: "Review the output",
        provider: { name: "review-provider" },
        model: "review-model",
        name: "Reviewer",
        description: "Review responses for accuracy",
      },
    ];
    harness.store.setSnapshot(harness.config);

    await harness.engine.run("Delegation run");

    const runtime = harness.fakeOrchestrator.lastRuntime;
    const subagents = runtime?.catalog.listSubagents() ?? [];
    expect(subagents.map((entry) => entry.id)).toEqual(["reviewer"]);

    const descriptor = subagents[0];
    expect(descriptor.provider.name).toBe("review-provider");
    expect(descriptor.model).toBe("review-model");
    expect(descriptor.metadata?.name).toBe("Reviewer");
    expect(descriptor.metadata?.description).toBe(
      "Review responses for accuracy"
    );
  });
});

describe("EngineService hot configuration", () => {
  it("picks up provider changes from the config store without new module instances", async () => {
    const initialConfig: EddieConfig = {
      model: "initial-model",
      provider: { name: "initial-provider" },
      context: { include: [], baseDir: process.cwd() },
      systemPrompt: "system",
      logLevel: "info",
      logging: { level: "info" },
      output: {},
      tools: {},
      hooks: {},
      tokenizer: {},
      agents: {
        mode: "manager",
        manager: { prompt: "be helpful" },
        subagents: [],
        enableSubagents: false,
      },
    };

    const store = new ConfigStore();
    store.setSnapshot(initialConfig);

    const configService = {
      load: vi.fn(async () => initialConfig),
    } as unknown as ConfigService;

    const context = { files: [], totalBytes: 1, text: "context" } as PackedContext;

    const contextService = {
      pack: vi.fn(async () => context),
    } as unknown as ContextService;

    const providerFactory = {
      create: vi.fn((config: ProviderConfig): ProviderAdapter => ({
        name: config.name,
        stream: vi.fn(),
      })),
    } as unknown as ProviderFactoryService;

    const hookBus = new HookBus();

    const hooksService = {
      load: vi.fn(async () => hookBus),
    } as unknown as HooksService;

    const confirmService = {
      create: vi.fn(() => async () => true),
    } as unknown as ConfirmService;

    const tokenizerService = {
      create: vi.fn(() => ({
        countTokens: (text: string) => text.length,
      })),
    } as unknown as TokenizerService;

    const loggerService = new LoggerService();
    const mcpToolSourceService = {
      collectTools: vi.fn(async () => ({ tools: [], resources: [], prompts: [] })),
    } as unknown as McpToolSourceService;

    const orchestrator = new FakeAgentOrchestrator();

    const engine = new EngineService(
      configService,
      store,
      contextService,
      providerFactory,
      hooksService,
      confirmService,
      tokenizerService,
      loggerService,
      orchestrator as unknown as AgentOrchestratorService,
      mcpToolSourceService
    );

    await engine.run("initial run");

    expect(providerFactory.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "initial-provider" })
    );

    const initialRuntime = orchestrator.lastRuntime;
    expect(initialRuntime?.catalog.getManager().provider.name).toBe(
      "initial-provider"
    );
    expect(initialRuntime?.catalog.getManager().model).toBe("initial-model");

    const updatedConfig: EddieConfig = {
      ...structuredClone(initialConfig),
      provider: { name: "alt-provider" },
      model: "alt-model",
      providers: {
        alt: {
          provider: { name: "alt-provider" },
          model: "alt-model",
        },
      },
      agents: {
        ...structuredClone(initialConfig.agents),
        manager: {
          ...structuredClone(initialConfig.agents.manager),
          provider: "alt",
        },
      },
    };

    store.setSnapshot(updatedConfig);
    providerFactory.create.mockClear();

    await engine.run("reloaded run");

    expect(providerFactory.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "alt-provider" })
    );

    const reloadedRuntime = orchestrator.lastRuntime;
    expect(reloadedRuntime?.catalog.getManager().provider.name).toBe(
      "alt-provider"
    );
    expect(reloadedRuntime?.catalog.getManager().model).toBe("alt-model");
  });
});
