import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventBus } from "@nestjs/cqrs";
import type { StreamEvent } from "@eddie/types";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";
import { InMemoryChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";
import type { ChatSessionEventsService } from "../../../src/chat-sessions/chat-session-events.service";

describe("ChatSessionStreamRendererService", () => {
  let service: ChatSessionsService;
  let renderer: ChatSessionStreamRendererService;
  let sessionId: string;
  let events: ChatSessionEventsService;
  let eventMocks: {
    emitPartial: ReturnType<typeof vi.fn>;
    emitToolCall: ReturnType<typeof vi.fn>;
    emitToolResult: ReturnType<typeof vi.fn>;
  };
  let publishSpy: ReturnType<typeof vi.fn>;

  const activityEvents = () =>
    publishSpy.mock.calls
      .map(([event]) => event)
      .filter((event) => event?.constructor?.name === "AgentActivityChangedEvent")
      .map((event) => ({ sessionId: event.sessionId, state: event.state }));

  beforeEach(() => {
    publishSpy = vi.fn();
    service = new ChatSessionsService(
      new InMemoryChatSessionsRepository(),
      { publish: publishSpy } as unknown as EventBus
    );
    eventMocks = {
      emitPartial: vi.fn(),
      emitToolCall: vi.fn(),
      emitToolResult: vi.fn(),
    };
    events = eventMocks as unknown as ChatSessionEventsService;
    renderer = new ChatSessionStreamRendererService(service, events);
    sessionId = service.createSession({ title: "Stream" }).id;
    publishSpy.mockClear();
  });

  it("creates and updates assistant messages from deltas", async () => {
    const capture = await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Hello" });
      renderer.render({ type: "delta", text: " world" });
      renderer.render({ type: "end" });
      return "ok";
    });

    expect(capture.error).toBeUndefined();
    expect(capture.result).toBe("ok");
    expect(capture.state.messageId).toBeDefined();

    const messages = service.listMessages(sessionId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("assistant");
    expect(messages[0]?.content).toBe("Hello world");
  });

  it("does not create messages when no deltas are rendered", async () => {
    const capture = await renderer.capture(sessionId, async () => {
      renderer.render({ type: "notification", payload: "noop" });
      renderer.render({ type: "end" });
    });

    expect(capture.error).toBeUndefined();
    expect(capture.state.messageId).toBeUndefined();
    expect(service.listMessages(sessionId)).toEqual([]);
  });

  it("preserves streamed content when the engine run fails", async () => {
    const capture = await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Partial" });
      throw new Error("boom");
    });

    expect(capture.error).toBeInstanceOf(Error);
    expect(capture.state.messageId).toBeDefined();
    const messages = service.listMessages(sessionId);
    expect(messages[0]?.content).toBe("Partial");
  });

  it("emits partial updates for assistant responses", async () => {
    const partialEvents: string[] = [];
    const emitPartialMock = eventMocks.emitPartial;
    emitPartialMock.mockImplementation((message: { content: string }) =>
      partialEvents.push(message.content)
    );

    await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Hello" });
      renderer.render({ type: "delta", text: " world" });
    });

    expect(partialEvents).toEqual(["Hello", "Hello world"]);
  });

  it("emits tool events through the events service", async () => {
    const toolCall: StreamEvent = {
      type: "tool_call",
      name: "echo",
      arguments: { text: "hi" },
      id: "t1",
    };
    const toolResult: StreamEvent = {
      type: "tool_result",
      name: "echo",
      result: { schema: "s1", content: "ok" },
      id: "t1",
    };
    await renderer.capture(sessionId, async () => {
      renderer.render(toolCall);
      renderer.render(toolResult);
    });

    expect(eventMocks.emitToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId, name: "echo", id: "t1" })
    );
    expect(eventMocks.emitToolResult).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId, name: "echo", id: "t1" })
    );
  });

  it("annotates tool events with consistent timestamps", async () => {
    vi.useFakeTimers();
    const now = new Date("2024-01-01T00:00:00.000Z");
    vi.setSystemTime(now);

    const toolCall: StreamEvent = {
      type: "tool_call",
      name: "echo",
      arguments: { text: "hi" },
      id: "call-1",
    };
    const toolResult: StreamEvent = {
      type: "tool_result",
      name: "echo",
      result: { schema: "s1", content: "ok" },
      id: "call-1",
    };

    await renderer.capture(sessionId, async () => {
      renderer.render(toolCall);
      renderer.render(toolResult);
    });

    expect(eventMocks.emitToolCall).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: now.toISOString() })
    );
    expect(eventMocks.emitToolResult).toHaveBeenCalledWith(
      expect.objectContaining({ timestamp: now.toISOString() })
    );

    vi.useRealTimers();
  });

  it("announces agent activity transitions for stream events", async () => {
    publishSpy.mockClear();

    await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Hello" });
      renderer.render({
        type: "tool_call",
        name: "echo",
        arguments: { text: "hi" },
        id: "call-1",
      });
      renderer.render({
        type: "tool_result",
        name: "echo",
        result: { schema: "s1", content: "ok" },
        id: "call-1",
      });
      renderer.render({ type: "end" });
    });

    expect(activityEvents()).toEqual([
      { sessionId, state: "thinking" },
      { sessionId, state: "tool" },
      { sessionId, state: "thinking" },
      { sessionId, state: "idle" },
    ]);
  });

  it("emits error activity for error and notification events", async () => {
    publishSpy.mockClear();

    await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Hi" });
      renderer.render({
        type: "notification",
        payload: "Tool failed",
        metadata: { severity: "error" },
      });
      renderer.render({ type: "error", message: "boom" });
    });

    expect(activityEvents()).toEqual([
      { sessionId, state: "thinking" },
      { sessionId, state: "error" },
    ]);
  });
});
