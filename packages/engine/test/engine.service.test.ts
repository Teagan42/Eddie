import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EngineService } from "../src/engine.service";
import type { EddieConfig } from "@eddie/config";
import type { PackedContext } from "@eddie/types";
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

interface ServiceOptions {
  packedContext?: PackedContext;
  discoveredResources?: DiscoveredMcpResource[];
  logger?: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
}

function createService(
  overrides: Partial<EddieConfig> = {},
  options: ServiceOptions = {}
) {
  const config: EddieConfig = { ...baseConfig, ...overrides };
  const configStore = { getSnapshot: vi.fn(() => config) };
  const packedContext: PackedContext = options.packedContext ?? {
    files: [],
    totalBytes: 0,
    text: "",
    resources: [],
  };
  const contextService = {
    pack: vi.fn(async () => packedContext),
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
    debug: options.logger?.debug ?? vi.fn(),
    error: options.logger?.error ?? vi.fn(),
    warn: options.logger?.warn ?? vi.fn(),
  };
  const loggerService = {
    configure: vi.fn(),
    getLogger: vi.fn(() => logger),
  };
  const agentOrchestrator = {
    setStreamRenderer: vi.fn(),
    runAgent: vi.fn(async () => ({
      messages: [],
      definition: { id: "manager" },
    })),
    collectInvocations: vi.fn(() => []),
  };
  const mcpToolSourceService = {
    collectTools: vi.fn(async () => ({
      tools: [],
      resources: options.discoveredResources ?? [],
      prompts: [],
    })),
  };

  const service = new EngineService(
    configStore as any,
    contextService as any,
    providerFactory as any,
    hooksService as any,
    confirmService as any,
    tokenizerService as any,
    loggerService as any,
    agentOrchestrator as any,
    mcpToolSourceService as any,
  );

  return {
    service,
    configStore,
    contextService,
    mcpToolSourceService,
    logger,
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
    expect(EngineService.length).toBe(9);
  });

  it("does not reload configuration when runtime overrides are provided", async () => {
    const { service, configStore } = createService();

    await service.run("prompt", { provider: "override" });

    expect(configStore.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("skips discovered MCP resources beyond the remaining byte budget", async () => {
    const initialContext: PackedContext = {
      files: [],
      totalBytes: 16,
      text: "Existing context",
      resources: [],
    };

    const smallResource: DiscoveredMcpResource = {
      sourceId: "alpha",
      name: "Accepted",
      uri: "https://example.com/accepted",
      description: "Helpful resource",
    };

    const largeResource: DiscoveredMcpResource = {
      sourceId: "beta",
      name: "Rejected",
      uri: "https://example.com/rejected",
      description: "Too large resource",
      metadata: {
        details: "x".repeat(200),
      },
    };

    const startingBytes = initialContext.totalBytes;

    const { service, logger } = createService(
      {
        context: {
          ...baseConfig.context,
          maxBytes: 64,
        },
      },
      {
        packedContext: initialContext,
        discoveredResources: [ smallResource, largeResource ],
      }
    );

    const result = await service.run("prompt");

    const acceptedResources = result.context.resources ?? [];
    const acceptedIds = acceptedResources.map((resource) => resource.name);
    const acceptedBytes = acceptedResources.reduce(
      (total, resource) => total + Buffer.byteLength(resource.text, "utf-8"),
      0
    );

    expect(acceptedIds).toContain("Accepted");
    expect(acceptedIds).not.toContain("Rejected");
    expect(result.context.totalBytes).toBe(startingBytes + acceptedBytes);
    expect(result.context.text).toContain("// Resource: Accepted");
    expect(result.context.text).not.toContain("Rejected");

    const debugCalls = logger.debug.mock.calls;
    expect(
      debugCalls.some((call) =>
        call.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("Skipping MCP resource beyond context byte budget")
        )
      )
    ).toBe(true);
  });
});
