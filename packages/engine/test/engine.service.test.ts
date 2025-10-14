import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EngineService } from "../src/engine.service";
import type { EddieConfig } from "@eddie/config";
import type { PackedContext } from "@eddie/types";
import type { DiscoveredMcpResource } from "@eddie/mcp";
import { formatResourceText } from "@eddie/context";

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

function createService(overrides: Partial<EddieConfig> = {}) {
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
      resources: [],
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

  return { service, configStore };
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

  it("formats discovered MCP resources with the shared helper", () => {
    const { service } = createService();
    const context: PackedContext = {
      files: [],
      totalBytes: 0,
      text: "",
      resources: [],
    };

    const discovered: DiscoveredMcpResource[] = [
      {
        sourceId: "source",
        name: "Example",
        uri: "mcp://example",
        description: "Details",
        mimeType: "text/plain",
        metadata: { key: "value" },
      },
    ];

    (service as any).applyMcpResourcesToContext(context, discovered);

    expect(context.resources).toHaveLength(1);
    const [packed] = context.resources!;
    expect(context.text).toBe(formatResourceText(packed));
  });
});
