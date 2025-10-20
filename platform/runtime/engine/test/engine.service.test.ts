import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EngineService } from "../src/engine.service";
import type { AgentRuntimeCatalog, EddieConfig, PackedContext } from "@eddie/types";
import type { DiscoveredMcpResource } from "@eddie/mcp";

const baseConfig: EddieConfig = {
  model: "base-model",
  provider: { name: "provider" },
  projectDir: "/tmp/project",
  context: { include: [], baseDir: "/tmp/project" },
  api: undefined,
  systemPrompt: "You are Eddie.",
  logLevel: "info",
  logging: { level: "info" },
  output: { jsonlAppend: true },
  tools: { enabled: [], disabled: [], autoApprove: false },
  hooks: {},
  tokenizer: { provider: "provider" },
  agents: {
    mode: "manager",
    manager: {
      prompt: "Manage the run.",
    },
    subagents: [],
    enableSubagents: false,
  },
  transcript: {},
};

function createService(
  overrides: Partial<EddieConfig> = {},
  options: { includeDemoSeedReplayService?: boolean } = {}
) {
  const config: EddieConfig = { ...baseConfig, ...overrides };
  const configStore = { getSnapshot: vi.fn(() => config) };
  const contextService = {
    pack: vi.fn(async () => ({
      files: [],
      totalBytes: 0,
      text: "",
      resources: [],
    }) as PackedContext),
  };
  const providerFactory = {
    create: vi.fn(() => ({ name: "adapter" })),
  };
  const hooks = {
    emitAsync: vi.fn(async () => ({})),
  };
  const hooksService = { load: vi.fn(async () => hooks) };
  const confirmService = { create: vi.fn(() => ({ confirm: vi.fn() })) };
  const tokenizerService = {
    create: vi.fn(() => ({ countTokens: vi.fn(() => 0) })),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
  const loggerService = {
    configure: vi.fn(),
    getLogger: vi.fn(() => logger),
  };
  const metrics = {
    countMessage: vi.fn(),
    observeToolCall: vi.fn(),
    countError: vi.fn(),
    timeOperation: vi.fn(async (_metric: string, fn: () => Promise<unknown>) => fn()),
    reset: vi.fn(),
    snapshot: vi.fn(() => ({ counters: {}, histograms: {} })),
  };
  const transcriptCompactionService = {
    createSelector: vi.fn(() => ({
      selectFor: vi.fn(),
      planAndApply: vi.fn(),
    })),
  };
  const agentOrchestrator = {
    runAgent: vi.fn(async () => ({
      messages: [],
      definition: { id: "manager" },
    })),
    collectInvocations: vi.fn(() => []),
  };
  const mcpToolSourceService = {
    collectTools: vi.fn(async () => ({
      tools: [],
      resources: [],
      prompts: [],
    })),
  };

  const { includeDemoSeedReplayService = true } = options;

  const demoSeedReplayService = includeDemoSeedReplayService
    ? {
        replayIfEnabled: vi.fn(async () => undefined),
      }
    : undefined;

  const service = new EngineService(
    configStore as any,
    contextService as any,
    providerFactory as any,
    hooksService as any,
    confirmService as any,
    tokenizerService as any,
    loggerService as any,
    transcriptCompactionService as any,
    agentOrchestrator as any,
    mcpToolSourceService as any,
    metrics as any,
    includeDemoSeedReplayService ? (demoSeedReplayService as any) : undefined,
  );

  return {
    service,
    configStore,
    contextService,
    mcpToolSourceService,
    logger,
    transcriptCompactionService,
    metrics,
    agentOrchestrator,
    demoSeedReplayService,
    config,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("EngineService", () => {
  it("does not declare a ConfigService dependency", () => {
    expect(EngineService.length).toBe(12);
  });

  it("does not reload configuration when runtime overrides are provided", async () => {
    const { service, configStore } = createService();

    await service.run("prompt", { provider: "override" });

    expect(configStore.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("requests a transcript compaction selector for each run", async () => {
    const { service, transcriptCompactionService } = createService();

    await service.run("prompt");

    expect(transcriptCompactionService.createSelector).toHaveBeenCalledTimes(1);
  });

  it("passes metrics through to the agent orchestrator", async () => {
    const { service, metrics, agentOrchestrator } = createService();

    await service.run("prompt");

    expect(agentOrchestrator.runAgent).toHaveBeenCalled();
    const [, runtimeOptions] = agentOrchestrator.runAgent.mock.calls[0] ?? [];
    expect(runtimeOptions?.metrics).toBe(metrics);
  });

  it("restricts spawnable subagents according to configuration allow list", () => {
    const { service, config } = createService({
      agents: {
        ...baseConfig.agents,
        enableSubagents: true,
        manager: {
          ...baseConfig.agents.manager,
          prompt: "Manage",
          allowedSubagents: ["researcher"],
        },
        subagents: [
          {
            id: "researcher",
            prompt: "Research",
            allowedSubagents: ["writer"],
          },
          {
            id: "writer",
            prompt: "Write",
          },
        ],
      },
    });

    const catalog = (service as unknown as {
      buildAgentCatalog(
        cfg: EddieConfig,
        tools: never[],
        context: PackedContext,
      ): AgentRuntimeCatalog;
    }).buildAgentCatalog(config, [], {
      files: [],
      totalBytes: 0,
      text: "",
      resources: [],
    });

    expect(
      catalog.listSpawnableSubagents("manager").map((agent) => agent.id)
    ).toEqual(["researcher"]);
    expect(
      catalog
        .listSpawnableSubagents("researcher")
        .map((agent) => agent.id)
    ).toEqual(["writer"]);
  });

  it("replays demo seeds when provided", async () => {
    const {
      service,
      agentOrchestrator,
      demoSeedReplayService,
      metrics,
    } = createService();

    demoSeedReplayService!.replayIfEnabled.mockResolvedValue({
      messages: [
        { role: "system", content: "You are Eddie." },
        { role: "assistant", content: "Demo" },
      ],
      assistantMessages: 1,
      tracePath: "/tmp/demo-trace.jsonl",
    });

    const result = await service.run("prompt");

    expect(agentOrchestrator.runAgent).not.toHaveBeenCalled();
    expect(result.messages).toHaveLength(2);
    expect(result.tracePath).toBe("/tmp/demo-trace.jsonl");
    expect(metrics.countMessage).toHaveBeenCalledWith("assistant");
  });

  it("treats DemoSeedReplayService as optional", async () => {
    const { service, agentOrchestrator } = createService({}, {
      includeDemoSeedReplayService: false,
    });

    const result = await service.run("prompt");

    expect(agentOrchestrator.runAgent).toHaveBeenCalledTimes(1);
    expect(result.messages).toEqual([]);
  });

  it("skips MCP resources that exceed context byte budget", async () => {
    const { service, contextService, mcpToolSourceService, logger } =
      createService({
        context: {
          include: [],
          baseDir: "/tmp/project",
          maxBytes: 60,
        },
      });

    const packedContext: PackedContext = {
      files: [],
      totalBytes: 10,
      text: "Existing context",
      resources: [],
    };

    contextService.pack.mockResolvedValue(packedContext);

    const smallResource: DiscoveredMcpResource = {
      sourceId: "alpha",
      name: "small",
      uri: "file://small",
      description: "A small resource",
    };

    const oversizedResource: DiscoveredMcpResource = {
      sourceId: "beta",
      name: "oversized",
      uri: "file://oversized",
      description: "A large resource",
      metadata: {
        notes: "x".repeat(200),
      },
    };

    mcpToolSourceService.collectTools.mockResolvedValue({
      tools: [],
      resources: [ smallResource, oversizedResource ],
      prompts: [],
    });

    const result = await service.run("prompt");

    const expectedBytes = Buffer.byteLength(`URI: ${ smallResource.uri }`, "utf-8");

    expect(result.context.resources).toHaveLength(1);
    expect(result.context.resources?.[0]?.name).toBe("small");
    expect(result.context.totalBytes).toBe(packedContext.totalBytes);
    expect(result.context.totalBytes).toBe(10 + expectedBytes);
    expect(result.context.text).toContain("// Resource: small");
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.stringContaining("mcp:"),
        resourceBytes: expect.any(Number),
        remainingBytes: expect.any(Number),
      }),
      "Skipping MCP resource exceeding maxBytes",
    );
  });
});
