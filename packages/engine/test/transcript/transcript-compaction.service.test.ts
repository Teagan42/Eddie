import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type { AgentRuntimeDescriptor } from "@eddie/types";
import type { AgentLifecyclePayload } from "@eddie/hooks";
import type { EddieConfig, TranscriptCompactorConfig } from "@eddie/types";
import {
  createTranscriptCompactor,
  registerTranscriptCompactor,
  resetTranscriptCompactorRegistry,
} from "../../src/transcript-compactors";
import type {
  TranscriptCompactor,
  TranscriptCompactionPlan,
} from "../../src/transcript-compactors";
import { TranscriptCompactionService } from "../../src/transcript/transcript-compaction.service";
import { HOOK_EVENTS } from "@eddie/hooks";

describe("TranscriptCompactionService", () => {
  beforeEach(() => {
    resetTranscriptCompactorRegistry();
  });

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

  class FakeCompactor implements TranscriptCompactor {
    constructor(readonly id: string) {}

    plan = vi.fn<
      [AgentInvocation, number],
      Promise<TranscriptCompactionPlan | null>
    >(async () => ({
      reason: "fake",
      apply: vi.fn(async () => ({ removedMessages: 1 })),
    }));
  }

  it("reuses cached compactors for the same agent configuration", async () => {
    registerTranscriptCompactor({
      strategy: "fake",
      create: (config: TranscriptCompactorConfig, context) =>
        new FakeCompactor(`${context.agentId}:${(config as any).tag}`),
    });

    const config: EddieConfig = {
      ...baseConfig,
      transcript: { compactor: { strategy: "fake", tag: "global" } },
      agents: {
        ...baseConfig.agents,
        manager: {
          ...baseConfig.agents.manager,
          transcript: { compactor: { strategy: "fake", tag: "manager" } },
        },
      },
    };

    const service = new TranscriptCompactionService(createTranscriptCompactor);
    const selector = service.createSelector(config);

    const invocation = {
      definition: { id: "manager" },
      messages: [],
    } as AgentInvocation;
    const descriptor = {
      id: "manager",
      model: "test",
      provider: { name: "provider" },
    } as AgentRuntimeDescriptor;

    const first = selector.selectFor(invocation, descriptor);
    const second = selector.selectFor(invocation, descriptor);

    expect(first).toBeInstanceOf(FakeCompactor);
    expect(second).toBe(first);
    expect((first as FakeCompactor).id).toBe("manager:manager");
  });

  it("prioritises agent-specific compactors over global configuration", () => {
    registerTranscriptCompactor({
      strategy: "fake",
      create: (config: TranscriptCompactorConfig, context) =>
        new FakeCompactor(`${context.agentId}:${(config as any).tag}`),
    });

    const config: EddieConfig = {
      ...baseConfig,
      transcript: { compactor: { strategy: "fake", tag: "global" } },
      agents: {
        ...baseConfig.agents,
        manager: {
          ...baseConfig.agents.manager,
          transcript: { compactor: { strategy: "fake", tag: "manager" } },
        },
        subagents: [
          {
            id: "worker",
            prompt: "Do work",
            transcript: { compactor: { strategy: "fake", tag: "worker" } },
          },
        ],
      },
    };

    const service = new TranscriptCompactionService(createTranscriptCompactor);
    const selector = service.createSelector(config);

    const manager = {
      definition: { id: "manager" },
      messages: [],
    } as AgentInvocation;
    const worker = {
      definition: { id: "worker" },
      messages: [],
    } as AgentInvocation;
    const unknown = {
      definition: { id: "observer" },
      messages: [],
    } as AgentInvocation;

    const managerDescriptor = {
      id: "manager",
      model: "test",
      provider: { name: "provider" },
    } as AgentRuntimeDescriptor;
    const workerDescriptor = {
      id: "worker",
      model: "test",
      provider: { name: "provider" },
    } as AgentRuntimeDescriptor;

    const managerCompactor = selector.selectFor(manager, managerDescriptor);
    const workerCompactor = selector.selectFor(worker, workerDescriptor);
    const fallbackCompactor = selector.selectFor(unknown, undefined);

    expect((managerCompactor as FakeCompactor).id).toBe("manager:manager");
    expect((workerCompactor as FakeCompactor).id).toBe("worker:worker");
    expect((fallbackCompactor as FakeCompactor).id).toBe("global:global");
  });

  it("propagates compaction plan failures", async () => {
    const failingCompactor: TranscriptCompactor = {
      plan: vi.fn(async () => ({
        reason: "test",
        apply: vi.fn(async () => {
          throw new Error("boom");
        }),
      })),
    };

    const hooks = { emitAsync: vi.fn(async () => ({})) };
    const runtime = {
      hooks,
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as { hooks: { emitAsync: typeof hooks.emitAsync }; logger: any };

    const lifecycle: AgentLifecyclePayload = {
      metadata: {
        id: "manager",
        isRoot: true,
        depth: 0,
        systemPrompt: "",
        tools: [],
      },
      prompt: "Prompt",
      context: { totalBytes: 0, fileCount: 0 },
      historyLength: 0,
    };

    const service = new TranscriptCompactionService(createTranscriptCompactor);
    const invocation = {
      definition: { id: "manager" },
      messages: [],
    } as AgentInvocation;

    await expect(
      service.planAndApply(failingCompactor, invocation, 1, runtime, lifecycle)
    ).rejects.toThrowError("boom");

    expect(hooks.emitAsync).toHaveBeenCalledWith(
      HOOK_EVENTS.preCompact,
      expect.objectContaining({ reason: "test" })
    );
  });
});
