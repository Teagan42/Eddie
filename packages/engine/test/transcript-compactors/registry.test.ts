import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { EddieConfig, TranscriptCompactorConfig } from "@eddie/types";
import {
  registerTranscriptCompactor,
  resetTranscriptCompactorRegistry,
} from "../../src/transcript-compactors/registry";
import type { TranscriptCompactor } from "../../src/transcript-compactors/types";
import { SummarizingTranscriptCompactor } from "../../src/transcript-compactors/summarizing-transcript-compactor";
import type {
  AgentInvocation,
  AgentRuntimeDescriptor,
} from "../../src/agents/agent-runtime.types";
import { TranscriptCompactionService } from "../../src/transcript/transcript-compaction.service";
import { createTranscriptCompactor } from "../../src/transcript-compactors";
import { extractTranscriptCompactionSettings } from "../../src/transcript/transcript-compaction.tokens";

class FakeCompactor implements TranscriptCompactor {
  constructor(readonly tag: string) {}

  compact(invocation: AgentInvocation, descriptor?: AgentRuntimeDescriptor) {
    return {
      ...invocation,
      definition: {
        ...invocation.definition,
        name: `${descriptor?.name ?? invocation.definition.name ?? ""}-${this.tag}`,
      },
    };
  }
}

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
  const config: EddieConfig = {
    ...structuredClone(baseConfig),
    ...overrides,
    agents: {
      ...structuredClone(baseConfig.agents),
      ...overrides.agents,
    },
    transcript: {
      ...structuredClone(baseConfig.transcript),
      ...overrides.transcript,
    },
  };

  const loader = () => extractTranscriptCompactionSettings(config);

  const service = new TranscriptCompactionService(loader, createTranscriptCompactor);

  return { service, config };
}

describe("Transcript compactor registry", () => {
  beforeEach(() => {
    resetTranscriptCompactorRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates registered compactors via the registry", () => {
    registerTranscriptCompactor({
      strategy: "fake",
      create(config, context) {
        expect(context.agentId).toBe("__global__");
        expect(config).toMatchObject({ strategy: "fake", tag: "alpha" });
        return new FakeCompactor(`${config.tag}`);
      },
    });

    const transcriptConfig: TranscriptCompactorConfig = {
      strategy: "fake",
      tag: "alpha",
    };

    const { service } = createService({
      transcript: { compactor: transcriptConfig },
    });

    const invocation: AgentInvocation = {
      definition: { id: "manager", name: "Manager" },
      messages: [],
    } as AgentInvocation;
    const descriptor: AgentRuntimeDescriptor = {
      id: "manager",
      definition: invocation.definition,
      model: "test",
      provider: { name: "provider", stream: vi.fn() },
    } as AgentRuntimeDescriptor;

    const compactor = service.selectFor(invocation, descriptor) as TranscriptCompactor;

    expect(compactor).toBeInstanceOf(FakeCompactor);

    const result = compactor.compact(invocation, descriptor);
    expect(result.definition?.name).toBe("Manager-alpha");
  });

  it("attaches a summarizer transcript compactor from global config", async () => {
    const { service } = createService({
      transcript: {
        compactor: {
          strategy: "summarizer",
          maxMessages: 4,
          windowSize: 2,
          label: "Conversation Summary",
        },
      },
    });

    const invocation = {
      definition: { id: "global" },
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "How are you?" },
        { role: "assistant", content: "Great" },
      ],
    } as unknown as AgentInvocation;
    const descriptor = {
      id: "global",
      definition: invocation.definition,
      model: "test",
      provider: { name: "provider", stream: vi.fn() },
    } as AgentRuntimeDescriptor;

    const compactor = service.selectFor(invocation, descriptor);

    expect(compactor).toBeInstanceOf(SummarizingTranscriptCompactor);

    const plan = (compactor as SummarizingTranscriptCompactor).plan(
      invocation,
      0,
    );

    expect(plan).not.toBeNull();

    await plan!.apply();

    expect(invocation.messages[1]?.role).toBe("assistant");
    expect(invocation.messages[1]?.content).toContain("Conversation Summary");
  });

  it("summarizes via the configured HTTP endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ summary: "HTTP summary" }),
    });

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const { service } = createService({
      transcript: {
        compactor: {
          strategy: "summarizer",
          maxMessages: 4,
          windowSize: 2,
          label: "Conversation Summary",
          http: {
            url: "https://example.com/summarize",
            headers: { Authorization: "Bearer token" },
          },
        },
      },
    });

    const invocation = {
      definition: { id: "global" },
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "How are you?" },
        { role: "assistant", content: "Great" },
      ],
    } as unknown as AgentInvocation;
    const descriptor = {
      id: "global",
      definition: invocation.definition,
      model: "test",
      provider: { name: "provider", stream: vi.fn() },
    } as AgentRuntimeDescriptor;

    const compactor = service.selectFor(invocation, descriptor);

    expect(compactor).toBeInstanceOf(SummarizingTranscriptCompactor);

    const plan = (compactor as SummarizingTranscriptCompactor).plan(
      invocation,
      0,
    );

    expect(plan).not.toBeNull();

    await plan!.apply();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/summarize");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      Authorization: "Bearer token",
    });
    expect(init?.body && JSON.parse(init.body as string)).toMatchObject({
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ],
      agentId: "__global__",
    });

    expect(invocation.messages[1]?.role).toBe("assistant");
    expect(invocation.messages[1]?.content).toContain("Conversation Summary");
    expect(invocation.messages[1]?.content).toContain("HTTP summary");
  });

  it("reuses the same transcript compactors across turns", () => {
    const create = vi.fn(
      (config: TranscriptCompactorConfig, context: { agentId: string }) =>
        new FakeCompactor(`${context.agentId}:${config.tag}`)
    );

    registerTranscriptCompactor({
      strategy: "fake",
      create,
    });

    const managerCompactor: TranscriptCompactorConfig = {
      strategy: "fake",
      tag: "manager",
    };

    const workerCompactor: TranscriptCompactorConfig = {
      strategy: "fake",
      tag: "worker",
    };

    const globalCompactor: TranscriptCompactorConfig = {
      strategy: "fake",
      tag: "global",
    };

    const { service } = createService({
      transcript: { compactor: globalCompactor },
      agents: {
        ...baseConfig.agents,
        manager: {
          ...baseConfig.agents.manager,
          transcript: { compactor: managerCompactor },
        },
        subagents: [
          {
            id: "worker",
            prompt: "Do work",
            transcript: { compactor: workerCompactor },
          },
        ],
      },
    });

    const workerInvocation = {
      definition: { id: "worker", name: "Worker" },
      messages: [],
    } as AgentInvocation;

    const workerDescriptor = {
      id: "worker",
      definition: workerInvocation.definition,
      model: "test",
      provider: { name: "provider", stream: vi.fn() },
    } as AgentRuntimeDescriptor;

    const managerInvocation = {
      definition: { id: "manager", name: "Manager" },
      messages: [],
    } as AgentInvocation;
    const managerDescriptor = {
      id: "manager",
      definition: managerInvocation.definition,
      model: "test",
      provider: { name: "provider", stream: vi.fn() },
    } as AgentRuntimeDescriptor;

    const otherInvocation = {
      definition: { id: "other", name: "Other" },
      messages: [],
    } as AgentInvocation;

    const compactorGlobal = service.selectFor(otherInvocation);
    const compactorManager = service.selectFor(managerInvocation, managerDescriptor);
    const compactorWorkerA = service.selectFor(workerInvocation, workerDescriptor);
    const compactorWorkerB = service.selectFor(workerInvocation, workerDescriptor);

    expect(create).toHaveBeenCalledTimes(3);
    expect(compactorGlobal).toBeDefined();
    expect(compactorManager).toBeDefined();
    expect(compactorWorkerA).toBe(compactorWorkerB);
  });
});
