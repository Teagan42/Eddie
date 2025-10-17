import { describe, expect, it, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import type { EddieConfig } from "@eddie/types";
import { ConfigStore } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { ProviderFactoryService } from "@eddie/providers";
import { HooksService } from "@eddie/hooks";
import { ConfirmService, LoggerService } from "@eddie/io";
import { TokenizerService } from "@eddie/tokenizers";
import { AgentOrchestratorService } from "../../src/agents/agent-orchestrator.service";
import { TranscriptCompactionService } from "../../src/transcript/transcript-compaction.service";
import { McpToolSourceService } from "@eddie/mcp";
import { EngineService } from "../../src/engine.service";
import {
  MetricsService,
  METRICS_BACKEND,
  metricsProviders,
  type MetricsBackend,
} from "../../src/telemetry/metrics.service";
import { LoggingMetricsBackend } from "../../src/telemetry/logging-metrics.backend";

describe("EngineService metrics", () => {
  const baseConfig: EddieConfig = {
    model: "test-model",
    provider: { name: "mock" },
    projectDir: "/tmp/project",
    context: { include: [], baseDir: "/tmp/project" },
    api: undefined,
    systemPrompt: "You are Eddie.",
    logLevel: "info",
    logging: { level: "info" },
    output: { jsonlAppend: true },
    tools: { enabled: [], disabled: [], autoApprove: false },
    hooks: {},
    tokenizer: { provider: "mock" },
    agents: {
      mode: "manager",
      manager: { prompt: "Manage." },
      subagents: [],
      enableSubagents: false,
    },
    transcript: {},
    metrics: { backend: { type: "logging", level: "verbose" } },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createModule = async () => {
    const hooks = { emitAsync: vi.fn(async () => ({})) };
    const confirm = { confirm: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ...metricsProviders,
        { provide: ConfigStore, useValue: { getSnapshot: vi.fn(() => ({ ...baseConfig })) } },
        { provide: ContextService, useValue: { pack: vi.fn(async () => ({ files: [], totalBytes: 0, text: "" })) } },
        { provide: ProviderFactoryService, useValue: { create: vi.fn(() => ({ name: "adapter" })) } },
        { provide: HooksService, useValue: { load: vi.fn(async () => hooks) } },
        { provide: ConfirmService, useValue: { create: vi.fn(() => confirm) } },
        { provide: TokenizerService, useValue: { create: vi.fn(() => ({ countTokens: vi.fn(() => 0) })) } },
        {
          provide: LoggerService,
          useValue: {
            configure: vi.fn(),
            getLogger: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn() })),
          },
        },
        {
          provide: TranscriptCompactionService,
          useValue: {
            createSelector: vi.fn(() => ({
              selectFor: vi.fn(),
              planAndApply: vi.fn(),
            })),
          },
        },
        {
          provide: AgentOrchestratorService,
          useValue: {
            runAgent: vi.fn(async (_request, runtime) => {
              runtime.metrics.countMessage("assistant");
              return {
                messages: [
                  { role: "system", content: "context" },
                  { role: "assistant", content: "response" },
                ],
                context: { files: [], totalBytes: 0, text: "" },
              };
            }),
            collectInvocations: vi.fn(() => []),
          },
        },
        { provide: McpToolSourceService, useValue: { collectTools: vi.fn(async () => ({ tools: [], resources: [], prompts: [] })) } },
      ],
    }).compile();

    const configStore = moduleRef.get<ConfigStore>(ConfigStore);
    const contextService = moduleRef.get<ContextService>(ContextService);
    const providerFactory = moduleRef.get<ProviderFactoryService>(ProviderFactoryService);
    const hooksService = moduleRef.get<HooksService>(HooksService);
    const confirmService = moduleRef.get<ConfirmService>(ConfirmService);
    const tokenizerService = moduleRef.get<TokenizerService>(TokenizerService);
    const loggerService = moduleRef.get<LoggerService>(LoggerService);
    const transcriptCompactionService = moduleRef.get<TranscriptCompactionService>(TranscriptCompactionService);
    const orchestrator = moduleRef.get<any>(AgentOrchestratorService);
    const mcpToolSourceService = moduleRef.get<McpToolSourceService>(McpToolSourceService);
    const metricsService = moduleRef.get<MetricsService>(MetricsService);
    const backend = moduleRef.get<MetricsBackend>(METRICS_BACKEND);

    const countMessageSpy = vi.spyOn(metricsService, "countMessage");
    const timeOperationSpy = vi.spyOn(metricsService, "timeOperation");
    const countErrorSpy = vi.spyOn(metricsService, "countError");

    const service = new EngineService(
      configStore as any,
      contextService as any,
      providerFactory as any,
      hooksService as any,
      confirmService as any,
      tokenizerService as any,
      loggerService as any,
      transcriptCompactionService as any,
      orchestrator as any,
      mcpToolSourceService as any,
      metricsService,
    );

    return { service, orchestrator, countMessageSpy, timeOperationSpy, countErrorSpy, backend };
  };

  it("counts user and assistant messages and wraps template rendering", async () => {
    const { service, orchestrator, countMessageSpy, timeOperationSpy, backend } =
      await createModule();

    await service.run("Hello world");

    expect(backend).toBeInstanceOf(LoggingMetricsBackend);
    expect(countMessageSpy).toHaveBeenCalledWith("user");
    expect(countMessageSpy).toHaveBeenCalledWith("assistant");
    expect(timeOperationSpy).toHaveBeenCalledWith(
      "template.render",
      expect.any(Function)
    );
    expect(orchestrator.runAgent).toHaveBeenCalledTimes(1);
  });

  it("records errors when run fails", async () => {
    const { service, orchestrator, countErrorSpy, backend } = await createModule();
    expect(backend).toBeInstanceOf(LoggingMetricsBackend);
    orchestrator.runAgent.mockRejectedValueOnce(new Error("boom"));

    await expect(service.run("Hello world")).rejects.toThrow("boom");
    expect(countErrorSpy).toHaveBeenCalledWith("engine.run");
  });
});
