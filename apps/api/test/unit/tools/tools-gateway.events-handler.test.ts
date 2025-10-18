import { beforeAll, describe, expect, it, vi } from "vitest";
import { ToolCallStarted, ToolCallUpdated, ToolCallCompleted } from "../../../src/tools/events/tool-call.events";

vi.mock("../../../src/websocket/utils", () => ({
  emitEvent: vi.fn(),
}));

let emitEvent: ReturnType<typeof vi.fn>;
let ToolsGateway: typeof import("../../../src/tools/tools.gateway")["ToolsGateway"];
let ToolCallsGatewayEventsHandler: typeof import("../../../src/tools/tool-calls-gateway.events-handler")["ToolCallsGatewayEventsHandler"];

beforeAll(async () => {
  ({ emitEvent } = (await import("../../../src/websocket/utils")) as { emitEvent: ReturnType<typeof vi.fn> });
  ({ ToolsGateway } = await import("../../../src/tools/tools.gateway"));
  ({ ToolCallsGatewayEventsHandler } = await import("../../../src/tools/tool-calls-gateway.events-handler"));
});

describe("ToolCallsGatewayEventsHandler", () => {
  it.skip("forwards lifecycle events to websocket clients", () => {
    const gateway = new ToolsGateway();
    const handler = new ToolCallsGatewayEventsHandler(gateway);

    const baseState = {
      sessionId: "s1",
      toolCallId: "t1",
      name: "summarise",
      status: "running" as const,
      arguments: { query: "hi" },
      result: null,
      startedAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
      agentId: "agent-77",
    };

    handler.handle(new ToolCallStarted(baseState));
    handler.handle(
      new ToolCallUpdated({
        ...baseState,
        arguments: { query: "hi", page: 2 },
        updatedAt: "2024-01-01T00:00:05.000Z",
      })
    );
    handler.handle(
      new ToolCallCompleted({
        ...baseState,
        status: "completed",
        result: { items: ["a"] },
        updatedAt: "2024-01-01T00:00:10.000Z",
      })
    );

    expect(emitEvent).toHaveBeenNthCalledWith(
      1,
      null,
      "tool.call",
      expect.objectContaining({
        sessionId: "s1",
        id: "t1",
        name: "summarise",
        agentId: "agent-77",
      })
    );
    expect(emitEvent).toHaveBeenNthCalledWith(
      2,
      null,
      "tool.call",
      expect.objectContaining({
        sessionId: "s1",
        id: "t1",
        name: "summarise",
        agentId: "agent-77",
      })
    );
    expect(emitEvent).toHaveBeenNthCalledWith(
      3,
      null,
      "tool.result",
      expect.objectContaining({
        sessionId: "s1",
        id: "t1",
        name: "summarise",
        agentId: "agent-77",
      })
    );
  });
});
