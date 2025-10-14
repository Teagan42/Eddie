import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventBus } from "@nestjs/cqrs";
import type { StreamEvent } from "@eddie/types";
import {
  ChatMessagePartialEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
} from "@eddie/types";
import {
  ChatSessionsService,
  type ChatSessionsListener,
} from "../../../src/chat-sessions/chat-sessions.service";
import { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";
import { InMemoryChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";

describe("ChatSessionStreamRendererService", () => {
    let service: ChatSessionsService;
    let renderer: ChatSessionStreamRendererService;
    let sessionId: string;
    let eventBus: EventBus;
    let publish: ReturnType<typeof vi.fn>;
    const captureActivity = (): Array<{ sessionId: string; state: string }> => {
      const events: Array<{ sessionId: string; state: string }> = [];
      service.registerListener({
        onSessionCreated: () => {},
        onSessionUpdated: () => {},
        onMessageCreated: () => {},
        onMessageUpdated: () => {},
        onAgentActivity: (event: { sessionId: string; state: string }) => {
          events.push(event);
        },
      } as unknown as ChatSessionsListener);
      return events;
    };

    const getPublishedEvents = () =>
      publish.mock.calls.map(([ event ]) => event);

    const getPartialEvents = () =>
      getPublishedEvents().filter(
        (event): event is ChatMessagePartialEvent =>
          event instanceof ChatMessagePartialEvent
      );

    beforeEach(async () => {
        service = new ChatSessionsService(new InMemoryChatSessionsRepository());
        publish = vi.fn();
        eventBus = { publish } as unknown as EventBus;
        renderer = new ChatSessionStreamRendererService(service, eventBus);
        sessionId = (await service.createSession({ title: "Stream" })).id;
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

    const messages = await service.listMessages(sessionId);
        expect(messages).toHaveLength(1);
        expect(messages[ 0 ]?.role).toBe("assistant");
        expect(messages[ 0 ]?.content).toBe("Hello world");
    });

    it("avoids emitting duplicate partial events when ending with unchanged content", async () => {
      await renderer.capture(sessionId, async () => {
        renderer.render({ type: "delta", text: "Hello" });
        renderer.render({ type: "delta", text: " world" });
        renderer.render({ type: "end" });
      });

      const partialEvents = getPartialEvents();

      expect(partialEvents).toHaveLength(2);
      expect(partialEvents.map((event) => event.message.content)).toEqual([
        "Hello",
        "Hello world",
      ]);
    });

    it("does not create messages when no deltas are rendered", async () => {
        const capture = await renderer.capture(sessionId, async () => {
            renderer.render({ type: "notification", payload: "noop" });
            renderer.render({ type: "end" });
        });

        expect(capture.error).toBeUndefined();
        expect(capture.state.messageId).toBeUndefined();
        await expect(service.listMessages(sessionId)).resolves.toEqual([]);
    });

    it("preserves streamed content when the engine run fails", async () => {
        const capture = await renderer.capture(sessionId, async () => {
            renderer.render({ type: "delta", text: "Partial" });
            throw new Error("boom");
        });

        expect(capture.error).toBeInstanceOf(Error);
        expect(capture.state.messageId).toBeDefined();
        const messages = await service.listMessages(sessionId);
        expect(messages[ 0 ]?.content).toBe("Partial");
    });
    it("publishes partial events for assistant responses", async () => {
        await renderer.capture(sessionId, async () => {
            renderer.render({ type: "delta", text: "Hello" });
            renderer.render({ type: "delta", text: " world" });
        });

        const partialEvents = getPartialEvents();
        expect(partialEvents).toHaveLength(2);
        const [ first, second ] = partialEvents;
        expect(first.message.content).toBe("Hello");
        expect(second.message.content).toBe("Hello world");
    });

  it("publishes tool call and result events", async () => {
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

      const publishedEvents = getPublishedEvents();
      expect(publishedEvents.some((event) => event instanceof ChatSessionToolCallEvent)).toBe(true);
      expect(publishedEvents.some((event) => event instanceof ChatSessionToolResultEvent)).toBe(true);
      const callEvent = publishedEvents.find((event): event is ChatSessionToolCallEvent => event instanceof ChatSessionToolCallEvent)!;
      const resultEvent = publishedEvents.find((event): event is ChatSessionToolResultEvent => event instanceof ChatSessionToolResultEvent)!;

      expect(callEvent).toMatchObject({ sessionId, name: "echo", id: "t1" });
      expect(resultEvent).toMatchObject({ sessionId, name: "echo", id: "t1" });
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

    const publishedEvents = getPublishedEvents();
    const callEvent = publishedEvents.find((event): event is ChatSessionToolCallEvent => event instanceof ChatSessionToolCallEvent)!;
    const resultEvent = publishedEvents.find((event): event is ChatSessionToolResultEvent => event instanceof ChatSessionToolResultEvent)!;

    expect(callEvent.timestamp).toBe(now.toISOString());
    expect(resultEvent.timestamp).toBe(now.toISOString());

    vi.useRealTimers();
  });

  it("announces agent activity transitions for stream events", async () => {
    const events = captureActivity();

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

    expect(
      events.map(({ sessionId: id, state }) => ({ sessionId: id, state }))
    ).toEqual([
      { sessionId, state: "thinking" },
      { sessionId, state: "tool" },
      { sessionId, state: "thinking" },
      { sessionId, state: "idle" },
    ]);
  });

  it("emits error activity for error and notification events", async () => {
    const events = captureActivity();

    await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Hi" });
      renderer.render({
        type: "notification",
        payload: "Tool failed",
        metadata: { severity: "error" },
      });
      renderer.render({ type: "error", message: "boom" });
    });

    expect(
      events.map(({ sessionId: id, state }) => ({ sessionId: id, state }))
    ).toEqual([
      { sessionId, state: "thinking" },
      { sessionId, state: "error" },
    ]);
  });
});
