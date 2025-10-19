import { describe, expect, it, vi } from "vitest";
import { AgentStreamEvent, HOOK_EVENTS, type ToolResult } from "@eddie/types";

import { AgentRunner } from "../../../src/agents/agent-runner";
import {
  createAgentRunnerTestContext,
  createDescriptor,
  createInvocation,
  createStream,
  createMetrics,
} from "../__fixtures__/runner-fixture";

const collectPublishedEvents = (publish: ReturnType<typeof vi.fn>) =>
  publish.mock.calls.map(([event]) => event as AgentStreamEvent);

describe("AgentRunLoop", () => {
  it("advances iteration lifecycle via injectable services", async () => {
    const invocation = createInvocation();
    const descriptor = createDescriptor({
      provider: {
        name: "mock",
        stream: vi.fn().mockReturnValue(
          createStream([
            { type: "delta", text: "Hello" },
            { type: "end", responseId: "resp-1" },
          ])
        ),
      },
    });

    const applyTranscriptCompactionIfNeeded = vi.fn();
    const metrics = createMetrics();
    metrics.timeOperation.mockImplementation(async (_metric, fn) => {
      await fn();
    });

    const hooks = { emitAsync: vi.fn().mockResolvedValue({}) };

    const { runner, publish, writeTrace } = createAgentRunnerTestContext({
      invocation,
      descriptor,
      hooks,
      metrics,
      applyTranscriptCompactionIfNeeded,
    });

    await runner.run();

    expect(metrics.timeOperation).toHaveBeenCalledWith(
      "transcript.compaction",
      expect.any(Function)
    );
    expect(applyTranscriptCompactionIfNeeded).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        iteration: 1,
        messages: invocation.messages,
      })
    );

    const hookSequence = hooks.emitAsync.mock.calls.map(([event]) => event);
    expect(hookSequence).toEqual([
      HOOK_EVENTS.beforeAgentStart,
      HOOK_EVENTS.beforeModelCall,
      HOOK_EVENTS.stop,
      HOOK_EVENTS.afterAgentComplete,
    ]);

    const published = collectPublishedEvents(publish);
    expect(published).toEqual([
      expect.objectContaining({
        event: expect.objectContaining({ type: "delta", agentId: invocation.id }),
      }),
      expect.objectContaining({
        event: expect.objectContaining({ type: "end", agentId: invocation.id }),
      }),
    ]);

    const tracePhases = writeTrace.mock.calls.map(([event]) => event.phase);
    expect(tracePhases).toContain("iteration_complete");
  });

  it("delegates tool calls to spawn handler and tool registry", async () => {
    const invocation = createInvocation();
    const spawnResult: ToolResult = { schema: "spawn", content: "spawned" };
    const toolResult: ToolResult = { schema: "tool", content: "done" };

    invocation.toolRegistry.execute = vi.fn().mockResolvedValue(toolResult);

    const provider = {
      name: "mock",
      stream: vi
        .fn()
        .mockReturnValueOnce(
          createStream([
            {
              type: "tool_call",
              id: "call_1",
              name: AgentRunner.SPAWN_TOOL_NAME,
              arguments: { prompt: "do it" },
            },
            { type: "end" },
          ])
        )
        .mockReturnValueOnce(
          createStream([
            {
              type: "tool_call",
              id: "call_2",
              name: "custom_tool",
              arguments: { input: 1 },
            },
            { type: "end" },
          ])
        )
        .mockReturnValueOnce(createStream([{ type: "end" }])),
    };

    const descriptor = createDescriptor({ provider });

    const executeSpawnTool = vi.fn().mockResolvedValue(spawnResult);
    const metrics = createMetrics();
    metrics.timeOperation.mockImplementation(async (_metric, fn) => {
      await fn();
    });

    const { runner } = createAgentRunnerTestContext({
      invocation,
      descriptor,
      executeSpawnTool,
      metrics,
    });

    await runner.run();

    expect(executeSpawnTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: "call_1", name: AgentRunner.SPAWN_TOOL_NAME })
    );
    expect(invocation.toolRegistry.execute).toHaveBeenCalledWith(
      expect.objectContaining({ id: "call_2", name: "custom_tool" }),
      expect.objectContaining({ cwd: expect.any(String) })
    );

    expect(metrics.observeToolCall).toHaveBeenCalledWith({
      name: AgentRunner.SPAWN_TOOL_NAME,
      status: "success",
    });
    expect(metrics.observeToolCall).toHaveBeenCalledWith({
      name: "custom_tool",
      status: "success",
    });
  });

  it("writes trace events for model and tool iterations", async () => {
    const invocation = createInvocation();
    const descriptor = createDescriptor({
      provider: {
        name: "mock",
        stream: vi
          .fn()
          .mockReturnValueOnce(
            createStream([
              { type: "tool_call", id: "call_1", name: "math", arguments: { x: 1 } },
              { type: "end" },
            ])
          )
          .mockReturnValueOnce(createStream([{ type: "end" }])),
      },
    });

    const metrics = createMetrics();
    metrics.timeOperation.mockImplementation(async (_metric, fn) => {
      await fn();
    });

    const toolResult: ToolResult = { schema: "tool.schema", content: "ok" };
    invocation.toolRegistry.execute = vi.fn().mockResolvedValue(toolResult);

    const { runner, writeTrace } = createAgentRunnerTestContext({
      invocation,
      descriptor,
      metrics,
    });

    await runner.run();

    expect(writeTrace).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        phase: "agent_start",
        data: expect.objectContaining({ model: descriptor.model }),
      }),
      expect.any(Boolean)
    );

    const traceEvents = writeTrace.mock.calls.map(([event]) => event);
    expect(traceEvents.some((event) => event.phase === "model_call")).toBe(true);

    const toolResultTrace = traceEvents.find((event) => event.phase === "tool_result");
    expect(toolResultTrace).toBeDefined();
    expect(toolResultTrace?.data).toEqual(
      expect.objectContaining({
        id: "call_1",
        result: toolResult,
        arguments: { x: 1 },
      })
    );

    expect(traceEvents.some((event) => event.phase === "iteration_complete")).toBe(
      true
    );
    expect(traceEvents.some((event) => event.phase === "agent_complete")).toBe(true);
  });

  it("publishes reasoning events without polluting assistant transcripts", async () => {
    const invocation = createInvocation();
    const descriptor = createDescriptor({
      provider: {
        name: "mock", 
        stream: vi.fn().mockReturnValue(
          createStream([
            { type: "reasoning_delta", id: "thought-1", text: "Step", agentId: "agent-1" },
            { type: "delta", text: "Answer", agentId: "agent-1" },
            { type: "reasoning_delta", id: "thought-1", text: " done", agentId: "agent-1" },
            { type: "reasoning_end", responseId: "resp-1", metadata: { score: 0.5 }, agentId: "agent-1" },
            { type: "end", responseId: "resp-1", agentId: "agent-1" },
          ])
        ),
      },
    });

    const { runner, publish } = createAgentRunnerTestContext({ invocation, descriptor });

    await runner.run();

    const published = collectPublishedEvents(publish);
    const reasoningEvents = published.filter((event) =>
      event.event.type === "reasoning_delta" || event.event.type === "reasoning_end"
    );
    expect(reasoningEvents).toHaveLength(3);
    expect(reasoningEvents.map((event) => event.event.type)).toEqual([
      "reasoning_delta",
      "reasoning_delta",
      "reasoning_end",
    ]);

    expect(invocation.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Answer",
    });
  });
});
