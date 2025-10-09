import { describe, expect, it, vi } from "vitest";
import type { StreamEvent } from "@eddie/types";
import { AgentOrchestratorService } from "../../src/agents/agent-orchestrator.service";
import type { AgentInvocation } from "../../src/agents/agent-invocation";
import type {
  AgentRuntimeCatalog,
  AgentRuntimeDescriptor,
} from "../../src/agents/agent-runtime.types";

const createStream = (events: StreamEvent[]): AsyncIterable<StreamEvent> => ({
  [Symbol.asyncIterator]: async function* () {
    for (const event of events) {
      yield event;
    }
  },
});

describe("AgentOrchestratorService", () => {
  it("threads previous response ids into subsequent provider calls", async () => {
    const agentDefinition = {
      id: "agent-1",
      systemPrompt: "You are helpful.",
      tools: [],
    };

    const invocation = {
      definition: agentDefinition,
      prompt: "List files",
      context: { files: [], totalBytes: 0, text: "" },
      history: [],
      messages: [
        { role: "system", content: agentDefinition.systemPrompt },
        { role: "user", content: "List files" },
      ],
      children: [],
      parent: undefined,
      toolRegistry: {
        schemas: () => [],
        execute: vi.fn().mockResolvedValue({ schema: "tool", content: "done" }),
      },
      setSpawnHandler: vi.fn(),
      addChild: vi.fn(),
      spawn: vi.fn(),
      id: agentDefinition.id,
      isRoot: true,
    } as unknown as AgentInvocation;

    const firstStreamEvents: StreamEvent[] = [
      {
        type: "tool_call",
        id: "call_1",
        name: "bash",
        arguments: {},
      },
      { type: "end", responseId: "resp_first" },
    ];

    const secondStreamEvents: StreamEvent[] = [
      { type: "delta", text: "Done" },
      { type: "end", responseId: "resp_second" },
    ];

    const providerStream = vi
      .fn()
      .mockReturnValueOnce(createStream(firstStreamEvents))
      .mockReturnValueOnce(createStream(secondStreamEvents));

    const descriptor: AgentRuntimeDescriptor = {
      id: agentDefinition.id,
      definition: agentDefinition,
      model: "gpt-test",
      provider: {
        name: "openai",
        stream: providerStream,
      },
    };

    const catalog: AgentRuntimeCatalog = {
      enableSubagents: false,
      getManager: () => descriptor,
      getAgent: () => descriptor,
      getSubagent: () => undefined,
      listSubagents: () => [],
    };

    const runtime = {
      catalog,
      hooks: { emitAsync: vi.fn().mockResolvedValue({}) },
      confirm: vi.fn().mockResolvedValue(true),
      cwd: process.cwd(),
      logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
      traceAppend: true,
      tracePath: undefined,
    };

    const invocationFactory = {
      create: vi.fn().mockResolvedValue(invocation),
    };

    const streamRenderer = {
      render: vi.fn(),
      flush: vi.fn(),
    };

    const traceWriter = {
      write: vi.fn(),
    };

    const orchestrator = new AgentOrchestratorService(
      invocationFactory as any,
      streamRenderer as any,
      traceWriter as any,
    );

    await orchestrator.runAgent(
      { definition: agentDefinition, prompt: "List files" },
      runtime as any,
    );

    expect(providerStream).toHaveBeenCalledTimes(2);
    expect(providerStream.mock.calls[1]?.[0]).toMatchObject({
      previousResponseId: "resp_first",
    });
  });
});
