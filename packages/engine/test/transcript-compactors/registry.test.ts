import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EngineService } from "../../src/engine.service";
import type { EddieConfig, TranscriptCompactorConfig } from "@eddie/config";
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
import { StreamRendererService } from "@eddie/io";

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
  const config: EddieConfig = { ...baseConfig, ...overrides };
  const configStore = { getSnapshot: vi.fn(() => config) };
  const contextService = {
    pack: vi.fn(async () => ({
      files: [],
      totalBytes: 0,
      text: "",
      resources: [],
    })),
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
    runAgent: vi.fn(async () => ({
      messages: [],
      definition: { id: "manager" },
    })),
    collectInvocations: vi.fn(() => []),
  };
  const streamRenderer = new StreamRendererService();
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
    streamRenderer as any,
  );

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
        expect(context.agentId).toBe("global");
        expect(config).toMatchObject({ strategy: "fake", tag: "alpha" });
        return new FakeCompactor(`${config.tag}`);
      },
    });

    const transcriptConfig: TranscriptCompactorConfig = {
      strategy: "fake",
      tag: "alpha",
    };

    const { service, config } = createService({
      transcript: { compactor: transcriptConfig },
    });

    const selector = (service as any).resolveTranscriptCompactor(config);

    expect(typeof selector).toBe("object");
    const compactor = selector as TranscriptCompactor;
    const invocation: AgentInvocation = {
      definition: { id: "manager", name: "Manager" },
      messages: [],
    } as AgentInvocation;

    const result = compactor.compact(invocation);
    expect(result.definition?.name).toBe("Manager-alpha");
  });

  it("attaches a summarizer transcript compactor from global config", async () => {
    const { service, config } = createService({
      transcript: {
        compactor: {
          strategy: "summarizer",
          maxMessages: 4,
          windowSize: 2,
          label: "Conversation Summary",
        },
      },
    });

    const compactor = (service as any).resolveTranscriptCompactor(config);

    expect(compactor).toBeInstanceOf(SummarizingTranscriptCompactor);

    const invocation = {
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "How are you?" },
        { role: "assistant", content: "Great" },
      ],
    } as unknown as AgentInvocation;

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

    const { service, config } = createService({
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

    const compactor = (service as any).resolveTranscriptCompactor(config);

    expect(compactor).toBeInstanceOf(SummarizingTranscriptCompactor);

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
      agentId: "global",
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

    const { service, config } = createService({
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

    const selectorA = (service as any).resolveTranscriptCompactor(config);
    const selectorB = (service as any).resolveTranscriptCompactor(config);

    expect(create).toHaveBeenCalledTimes(3);

    expect(typeof selectorA).toBe("function");
    expect(typeof selectorB).toBe("function");

    const workerInvocation = {
      definition: { id: "worker", name: "Worker" },
      messages: [],
    } as AgentInvocation;

    const workerDescriptor = {
      id: "worker",
      name: "Worker",
    } as AgentRuntimeDescriptor;

    const compactorA = (selectorA as any)(workerInvocation, workerDescriptor);
    const compactorB = (selectorB as any)(workerInvocation, workerDescriptor);

    expect(compactorA).toBe(compactorB);
  });
});
