import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ToolCallStarted,
  ToolCallUpdated,
  ToolCallCompleted,
  type ToolCallLifecycleEvent,
} from "../../../src/tools/events/tool-call.events";
import type { ToolCallState } from "../../../src/tools/tool-call.store";

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
  const createBaseState = (): ToolCallState => ({
    sessionId: "s1",
    toolCallId: "t1",
    name: "summarise",
    status: "running",
    arguments: { query: "hi" },
    result: null,
    startedAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    agentId: "agent-77",
  });

  it("forwards lifecycle events to websocket clients", () => {
    const gateway = new ToolsGateway();
    const handler = new ToolCallsGatewayEventsHandler(gateway);

    const baseState = createBaseState();

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
        status: "running",
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
        status: "running",
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
        status: "completed",
      })
    );
  });

  it("handles events created before module reloads", async () => {
    vi.resetModules();

    const {
      ToolCallStarted: Started,
      ToolCallUpdated: Updated,
      ToolCallCompleted: Completed,
    } = await import("../../../src/tools/events/tool-call.events");

    const baseState = createBaseState();

    const events = [
      new Started(baseState),
      new Updated({
        ...baseState,
        arguments: { query: "hi", page: 2 },
        updatedAt: "2024-01-01T00:00:05.000Z",
      }),
      new Completed({
        ...baseState,
        status: "completed",
        result: { items: ["a"] },
        updatedAt: "2024-01-01T00:00:10.000Z",
      }),
    ];

    const emitEventMock = vi.fn();

    vi.doMock("../../../src/websocket/utils", () => ({
      emitEvent: emitEventMock,
    }));

    const { ToolsGateway: ReloadedGateway } = await import("../../../src/tools/tools.gateway");
    const { ToolCallsGatewayEventsHandler: ReloadedHandler } = await import(
      "../../../src/tools/tool-calls-gateway.events-handler"
    );

    const gateway = new ReloadedGateway();
    const handler = new ReloadedHandler(gateway);

    for (const event of events) {
      handler.handle(event);
    }

    expect(emitEventMock).toHaveBeenNthCalledWith(
      1,
      null,
      "tool.call",
      expect.objectContaining({ id: "t1", status: "running" })
    );
    expect(emitEventMock).toHaveBeenNthCalledWith(
      2,
      null,
      "tool.call",
      expect.objectContaining({ id: "t1", status: "running" })
    );
    expect(emitEventMock).toHaveBeenNthCalledWith(
      3,
      null,
      "tool.result",
      expect.objectContaining({ id: "t1", status: "completed" })
    );
  });

  it("handles plain object lifecycle events", () => {
    const baseState = createBaseState();

    const started = new ToolCallStarted(baseState);
    const updated = new ToolCallUpdated({
      ...baseState,
      arguments: { query: "hi", page: 2 },
      updatedAt: "2024-01-01T00:00:05.000Z",
    });
    const completed = new ToolCallCompleted({
      ...baseState,
      status: "completed",
      result: { items: ["a"] },
      updatedAt: "2024-01-01T00:00:10.000Z",
    });

    const plainEvents = [started, updated, completed].map((event) => {
      const clone = JSON.parse(JSON.stringify(event)) as typeof event;
      return Object.assign(clone, { kind: event.constructor.name });
    });

    const emitToolCall = vi.fn();
    const emitToolResult = vi.fn();

    const handler = new ToolCallsGatewayEventsHandler({
      emitToolCall,
      emitToolResult,
    } as unknown as ToolsGateway);

    for (const event of plainEvents) {
      handler.handle(event as unknown as ToolCallLifecycleEvent);
    }

    expect(emitToolCall).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "t1", status: "running" })
    );
    expect(emitToolCall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: "t1", status: "running" })
    );
    expect(emitToolResult).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: "t1", status: "completed" })
    );
  });
});
