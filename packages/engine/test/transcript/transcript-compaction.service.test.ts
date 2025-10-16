import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type { AgentRuntimeDescriptor } from "../../src/agents/agent-runtime.types";
import { TranscriptCompactionService } from "../../src/transcript/transcript-compaction.service";
import type {
  TranscriptCompactionSettings,
  TranscriptCompactionSettingsLoader,
  TranscriptCompactorFactoryFn,
} from "../../src/transcript/transcript-compaction.tokens";
import type {
  TranscriptCompactor,
  TranscriptCompactorConfig,
} from "../../src/transcript-compactors";
import { HOOK_EVENTS } from "@eddie/hooks";

const createInvocation = (id: string): AgentInvocation => ({
  id,
  definition: { id, systemPrompt: "", tools: [] },
  prompt: "",
  context: { files: [], totalBytes: 0, text: "" },
  history: [],
  messages: [],
  children: [],
  addChild: vi.fn(),
  setSpawnHandler: vi.fn(),
  setRuntime: vi.fn(),
  toolRegistry: { schemas: () => [], execute: vi.fn() },
  isRoot: true,
  parent: undefined,
  spawn: vi.fn(),
} as unknown as AgentInvocation);

const descriptorFor = (id: string): AgentRuntimeDescriptor => ({
  id,
  definition: { id, systemPrompt: "", tools: [] },
  model: "model",
  provider: { name: "provider", stream: vi.fn() },
});

describe("TranscriptCompactionService", () => {
  let settings: TranscriptCompactionSettings;
  let loader: TranscriptCompactionSettingsLoader;
  let factory: TranscriptCompactorFactoryFn;

  beforeEach(() => {
    settings = {
      global: undefined,
      agents: {},
    };

    loader = vi.fn(() => settings);
    factory = vi.fn(() => ({
      plan: vi.fn(),
    }) as TranscriptCompactor);
  });

  it("caches compactors per agent until their configuration changes", () => {
    const managerConfig: TranscriptCompactorConfig = { strategy: "simple" };
    settings.agents.manager = managerConfig;

    const service = new TranscriptCompactionService(loader, factory);
    const invocation = createInvocation("manager");
    const descriptor = descriptorFor("manager");

    const first = service.selectFor(invocation, descriptor);
    const second = service.selectFor(invocation, descriptor);

    expect(first).toBeDefined();
    expect(first).toBe(second);
    expect(factory).toHaveBeenCalledTimes(1);

    settings.agents.manager = { strategy: "token-budget", options: { maxTokens: 512 } } as TranscriptCompactorConfig;

    const third = service.selectFor(invocation, descriptor);

    expect(third).not.toBe(first);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("prefers per-agent compactor configuration over global defaults", () => {
    const service = new TranscriptCompactionService(loader, factory);
    settings.global = { strategy: "simple" };
    settings.agents.writer = { strategy: "summarizing", maxMessages: 5 } as TranscriptCompactorConfig;

    const writer = service.selectFor(createInvocation("writer"), descriptorFor("writer"));
    const reviewer = service.selectFor(createInvocation("reviewer"), descriptorFor("reviewer"));

    expect(writer).toBeDefined();
    expect(reviewer).toBeDefined();

    const calls = (factory as unknown as { mock: { calls: unknown[][]; }; }).mock.calls;
    const writerArgs = calls.find((call) => (call?.[1] as { agentId: string; }).agentId === "writer");
    const globalArgs = calls.find((call) => (call?.[1] as { agentId: string; }).agentId === "__global__");

    expect(writerArgs?.[0]).toEqual(settings.agents.writer);
    expect(globalArgs?.[0]).toEqual(settings.global);
  });

  it("propagates errors thrown while applying a compaction plan", async () => {
    const service = new TranscriptCompactionService(loader, factory);
    const invocation = createInvocation("manager");
    const descriptor = descriptorFor("manager");
    const error = new Error("boom");

    const compactor: TranscriptCompactor = {
      plan: vi.fn(async () => ({
        reason: "Testing",
        apply: vi.fn(async () => {
          throw error;
        }),
      })),
    };

    const selector = vi.fn(() => compactor);
    const hooks = { emitAsync: vi.fn(async () => ({})) };
    const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await expect(() =>
      service.planAndApply({
        selector,
        invocation,
        descriptor,
        iteration: 1,
        lifecycle: {
          metadata: { id: invocation.id, depth: 0 },
          prompt: "",
          context: { totalBytes: 0, fileCount: 0 },
          historyLength: 0,
        },
        hooks: hooks as any,
        logger: logger as any,
      })
    ).rejects.toThrow(error);

    expect(hooks.emitAsync).toHaveBeenCalledWith(
      HOOK_EVENTS.preCompact,
      expect.objectContaining({ reason: "Testing" })
    );
  });
});
