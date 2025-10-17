import { describe, expect, it, vi } from "vitest";
import type { ToolResult } from "@eddie/types";
import {
  createAgentRunnerTestContext,
  createDescriptor,
  createInvocation,
  createMetrics,
  createStream,
} from "./__fixtures__/runner-fixture";

describe("AgentRunner metrics", () => {
  it("records successful tool calls", async () => {
    const invocation = createInvocation();
    const toolResult: ToolResult = { schema: "tool.schema", content: "done" };
    invocation.toolRegistry.execute = vi.fn().mockResolvedValue(toolResult);
    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "tool_call", id: "call_1", name: "math", arguments: { x: 1 } },
          { type: "end", responseId: "resp_a" },
        ])
      )
      .mockReturnValueOnce(createStream([{ type: "end" }]));
    const descriptor = createDescriptor({ provider: { name: "mock", stream: providerStream } });
    const dispatchHookOrThrow = vi.fn().mockResolvedValue({});
    const metrics = createMetrics();

    const { runner } = createAgentRunnerTestContext({
      invocation,
      descriptor,
      dispatchHookOrThrow,
      metrics,
    });

    await runner.run();

    expect(metrics.observeToolCall).toHaveBeenCalledWith({
      name: "math",
      status: "success",
    });
  });

  it("records vetoed tool calls", async () => {
    const invocation = createInvocation();
    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "tool_call", id: "call_1", name: "math", arguments: { x: 1 } },
          { type: "end", responseId: "resp_a" },
        ])
      )
      .mockReturnValueOnce(createStream([{ type: "end" }]));
    const descriptor = createDescriptor({ provider: { name: "mock", stream: providerStream } });
    const dispatchHookOrThrow = vi.fn().mockResolvedValue({ blocked: { reason: "no" } });
    const metrics = createMetrics();

    const { runner } = createAgentRunnerTestContext({
      invocation,
      descriptor,
      dispatchHookOrThrow,
      metrics,
    });

    await runner.run();

    expect(metrics.observeToolCall).toHaveBeenCalledWith({
      name: "math",
      status: "blocked",
    });
  });

  it("records tool call errors and transcript compaction timing", async () => {
    const invocation = createInvocation();
    invocation.toolRegistry.execute = vi.fn().mockRejectedValue(new Error("fail"));
    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "tool_call", id: "call_1", name: "math", arguments: { x: 1 } },
          { type: "end", responseId: "resp_a" },
        ])
      )
      .mockReturnValueOnce(createStream([{ type: "end" }]));
    const descriptor = createDescriptor({ provider: { name: "mock", stream: providerStream } });
    const dispatchHookOrThrow = vi.fn().mockResolvedValue({});
    const metrics = createMetrics();
    const applyTranscriptCompactionIfNeeded = vi.fn();

    const { runner } = createAgentRunnerTestContext({
      invocation,
      descriptor,
      dispatchHookOrThrow,
      metrics,
      applyTranscriptCompactionIfNeeded,
    });

    await runner.run();

    expect(metrics.observeToolCall).toHaveBeenCalledWith({
      name: "math",
      status: "error",
    });
    expect(metrics.countError).toHaveBeenCalledWith("tool.execution");
    expect(metrics.timeOperation).toHaveBeenCalledWith(
      "transcript.compaction",
      expect.any(Function)
    );
  });

  it("records agent stream errors", async () => {
    const invocation = createInvocation();
    const providerStream = vi
      .fn()
      .mockReturnValueOnce(
        createStream([
          { type: "error", message: "unavailable", cause: "overload" },
          { type: "end" },
        ])
      );
    const descriptor = createDescriptor({ provider: { name: "mock", stream: providerStream } });
    const metrics = createMetrics();

    const { runner } = createAgentRunnerTestContext({ invocation, descriptor, metrics });

    await runner.run();

    expect(metrics.countError).toHaveBeenCalledWith("agent.stream");
  });
});
