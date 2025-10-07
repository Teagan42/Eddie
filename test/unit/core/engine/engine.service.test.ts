import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import type { EddieConfig } from "../../../../src/config/types";
import { EngineService } from "../../../../src/core/engine/engine.service";
import type {
  ChatMessage,
  PackedContext,
  ProviderAdapter,
} from "../../../../src/core/types";
import {
  AgentInvocation,
  type AgentRunRequest,
  type AgentRuntimeOptions,
  type AgentOrchestratorService,
} from "../../../../src/core/agents";
import { ToolRegistryFactory } from "../../../../src/core/tools";
import type { ConfigService } from "../../../../src/config";
import type { ContextService } from "../../../../src/core/context/context.service";
import type { ProviderFactoryService } from "../../../../src/core/providers/provider-factory.service";
import { HookBus } from "../../../../src/hooks";
import type { HooksService } from "../../../../src/hooks";
import type { ConfirmService } from "../../../../src/io";
import { LoggerService } from "../../../../src/io";
import type { TokenizerService } from "../../../../src/core/tokenizers";

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

  const configService = {
    load: vi.fn(async () => config),
  } as unknown as ConfigService;

  const contextService = {
    pack: vi.fn(async () => context),
  } as unknown as ContextService;

  const provider: ProviderAdapter = {
    name: "stub",
    stream: vi.fn(),
  };

  const providerFactory = {
    create: vi.fn(() => provider),
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

  const fakeOrchestrator = new FakeAgentOrchestrator();
  if (overrides?.orchestratorShouldFail) {
    fakeOrchestrator.shouldFail = true;
  }

  const engine = new EngineService(
    configService,
    contextService,
    providerFactory,
    hooksService,
    confirmService,
    tokenizerService,
    loggerService,
    fakeOrchestrator as unknown as AgentOrchestratorService
  );

  return {
    engine,
    hookBus,
    config,
    context,
    fakeOrchestrator,
  };
}

describe("EngineService hooks", () => {
  it("emits session lifecycle hooks with metadata", async () => {
    const harness = createEngineHarness();
    const events: Array<{ event: string; payload: any }> = [];

    harness.hookBus.on("SessionStart", (payload) =>
      events.push({ event: "SessionStart", payload })
    );
    harness.hookBus.on("UserPromptSubmit", (payload) =>
      events.push({ event: "UserPromptSubmit", payload })
    );
    harness.hookBus.on("SessionEnd", (payload) =>
      events.push({ event: "SessionEnd", payload })
    );

    const history: ChatMessage[] = [{ role: "user", content: "earlier" }];
    const result = await harness.engine.run("Execute plan", { history });

    expect(events.map((entry) => entry.event)).toEqual([
      "SessionStart",
      "UserPromptSubmit",
      "SessionEnd",
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

  it("emits SessionEnd with error details when orchestration fails", async () => {
    const harness = createEngineHarness({ orchestratorShouldFail: true });
    const events: Array<{ event: string; payload: any }> = [];

    harness.hookBus.on("SessionStart", (payload) =>
      events.push({ event: "SessionStart", payload })
    );
    harness.hookBus.on("UserPromptSubmit", (payload) =>
      events.push({ event: "UserPromptSubmit", payload })
    );
    harness.hookBus.on("SessionEnd", (payload) =>
      events.push({ event: "SessionEnd", payload })
    );

    await expect(harness.engine.run("Failing run"))
      .rejects.toThrow("orchestrator failed");

    expect(events.map((entry) => entry.event)).toEqual([
      "SessionStart",
      "UserPromptSubmit",
      "SessionEnd",
    ]);

    const end = events.at(-1)?.payload;
    expect(end.status).toBe("error");
    expect(end.error?.message).toBe("orchestrator failed");
    expect(end.result).toBeUndefined();
  });
});
