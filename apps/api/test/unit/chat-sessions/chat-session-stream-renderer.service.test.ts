import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventBus } from "@nestjs/cqrs";
import type { StreamEvent } from "@eddie/types";
import {
  ChatMessagePartialEvent,
  ChatMessageReasoningCompleteEvent,
  ChatMessageReasoningPartialEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
} from "@eddie/types";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";
import { InMemoryChatSessionsRepository } from "../../../src/chat-sessions/chat-sessions.repository";
import { AgentActivity } from "../../../src/chat-sessions/events";

describe("ChatSessionStreamRendererService", () => {
  let service: ChatSessionsService;
  let renderer: ChatSessionStreamRendererService;
  let sessionId: string;
  let eventBus: EventBus;
  let publish: ReturnType<typeof vi.fn>;

  const getPublishedEvents = () => publish.mock.calls.map(([ event ]) => event);

  const getPartialEvents = () =>
    getPublishedEvents().filter(
      (event): event is ChatMessagePartialEvent =>
        event instanceof ChatMessagePartialEvent
    );

  const getReasoningPartials = () =>
    getPublishedEvents().filter(
      (event): event is ChatMessageReasoningPartialEvent =>
        event instanceof ChatMessageReasoningPartialEvent
    );

  const getReasoningCompletes = () =>
    getPublishedEvents().filter(
      (event): event is ChatMessageReasoningCompleteEvent =>
        event instanceof ChatMessageReasoningCompleteEvent
    );

  const getActivityEvents = () =>
    getPublishedEvents().filter(
      (event): event is AgentActivity => event instanceof AgentActivity
    );

  const getActivityStates = () =>
    getActivityEvents().map(({ sessionId: id, state }) => ({ sessionId: id, state }));

  beforeEach(async () => {
    publish = vi.fn();
    eventBus = { publish } as unknown as EventBus;
    service = new ChatSessionsService(
      new InMemoryChatSessionsRepository(),
      eventBus
    );
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
    expect(messages[0]?.role).toBe("assistant");
    expect(messages[0]?.content).toBe("Hello world");
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
    expect(messages[0]?.content).toBe("Partial");
  });

  it("propagates failures from pending render tasks", async () => {
    publish.mockImplementation((event: unknown) => {
      if (event instanceof ChatMessagePartialEvent) {
        throw new Error("publish failed");
      }
    });

    await expect(
      renderer.capture(sessionId, async () => {
        renderer.render({ type: "delta", text: "Hello" });
      })
    ).rejects.toThrowError("publish failed");
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
      agentId: "agent-alpha",
    };
    const toolResult: StreamEvent = {
      type: "tool_result",
      name: "echo",
      result: { schema: "s1", content: "ok" },
      id: "t1",
      agentId: "agent-alpha",
    };
    await renderer.capture(sessionId, async () => {
      renderer.render(toolCall);
      renderer.render(toolResult);
    });

    const publishedEvents = getPublishedEvents();
    expect(publishedEvents.some((event) => event instanceof ChatSessionToolCallEvent)).toBe(
      true
    );
    expect(publishedEvents.some((event) => event instanceof ChatSessionToolResultEvent)).toBe(
      true
    );
    const callEvent = publishedEvents.find(
      (event): event is ChatSessionToolCallEvent =>
        event instanceof ChatSessionToolCallEvent
    )!;
    const resultEvent = publishedEvents.find(
      (event): event is ChatSessionToolResultEvent =>
        event instanceof ChatSessionToolResultEvent
    )!;

    expect(callEvent).toMatchObject({
      sessionId,
      name: "echo",
      id: "t1",
      agentId: "agent-alpha",
    });
    expect(resultEvent).toMatchObject({
      sessionId,
      name: "echo",
      id: "t1",
      agentId: "agent-alpha",
    });
  });

  it("publishes reasoning updates without mutating assistant content", async () => {
    const reasoningDelta: StreamEvent = {
      type: "reasoning_delta",
      id: "thought-1",
      text: "Step 1",
      metadata: { effort: "analysis" },
      agentId: "agent-alpha",
    };
    const reasoningFollowUp: StreamEvent = {
      type: "reasoning_delta",
      id: "thought-1",
      text: " → Step 2",
      metadata: { effort: "analysis" },
      agentId: "agent-alpha",
    };
    const reasoningEnd: StreamEvent = {
      type: "reasoning_end",
      responseId: "resp-123",
      metadata: { score: 0.9 },
      agentId: "agent-alpha",
    };

    await renderer.capture(sessionId, async () => {
      renderer.render(reasoningDelta);
      renderer.render({ type: "delta", text: "Final answer", agentId: "agent-alpha" });
      renderer.render(reasoningFollowUp);
      renderer.render(reasoningEnd);
      renderer.render({ type: "end", responseId: "resp-123", agentId: "agent-alpha" });
    });

    const messages = await service.listMessages(sessionId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("Final answer");

    const reasoningPartials = getReasoningPartials();
    expect(reasoningPartials).toHaveLength(2);
    const [ first, second ] = reasoningPartials;
    expect(first).toMatchObject({
      sessionId,
      messageId: messages[0]?.id,
      reasoningId: "thought-1",
      text: "Step 1",
      agentId: "agent-alpha",
    });
    expect(second).toMatchObject({
      sessionId,
      messageId: messages[0]?.id,
      reasoningId: "thought-1",
      text: "Step 1 → Step 2",
      agentId: "agent-alpha",
    });

    const [ complete ] = getReasoningCompletes();
    expect(complete).toMatchObject({
      sessionId,
      messageId: messages[0]?.id,
      reasoningId: "thought-1",
      responseId: "resp-123",
      agentId: "agent-alpha",
      text: "Step 1 → Step 2",
      metadata: { score: 0.9 },
    });
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
      agentId: "agent-bravo",
    };
    const toolResult: StreamEvent = {
      type: "tool_result",
      name: "echo",
      result: { schema: "s1", content: "ok" },
      id: "call-1",
      agentId: "agent-bravo",
    };

    const expectedTimestamp = now.toISOString();

    await renderer.capture(sessionId, async () => {
      renderer.render(toolCall);
      vi.advanceTimersByTime(1);
      renderer.render(toolResult);
    });

    const publishedEvents = getPublishedEvents();
    const callEvent = publishedEvents.find(
      (event): event is ChatSessionToolCallEvent =>
        event instanceof ChatSessionToolCallEvent
    )!;
    const resultEvent = publishedEvents.find(
      (event): event is ChatSessionToolResultEvent =>
        event instanceof ChatSessionToolResultEvent
    )!;

    expect(callEvent.timestamp).toBe(expectedTimestamp);
    expect(callEvent).toHaveProperty("agentId", "agent-bravo");
    expect(resultEvent.timestamp).toBe(expectedTimestamp);
    expect(resultEvent).toHaveProperty("agentId", "agent-bravo");

    vi.useRealTimers();
  });

  it("announces agent activity transitions for stream events", async () => {
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

    expect(getActivityStates()).toEqual([
      { sessionId, state: "thinking" },
      { sessionId, state: "tool" },
      { sessionId, state: "thinking" },
      { sessionId, state: "idle" },
    ]);
  });

  it("emits agent error activity for non-tool failures", async () => {
    await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Hi" });
      renderer.render({
        type: "notification",
        payload: "Agent failed",
        metadata: { severity: "error" },
      });
      renderer.render({ type: "error", message: "boom" });
    });

    expect(getActivityStates()).toEqual([
      { sessionId, state: "thinking" },
      { sessionId, state: "error" },
    ]);
  });

  it("emits tool error activity when a tool failure notification arrives", async () => {
    await renderer.capture(sessionId, async () => {
      renderer.render({ type: "delta", text: "Hi" });
      renderer.render({
        type: "notification",
        payload: "Tool failed",
        metadata: { severity: "error", tool: "echo" },
      });
      renderer.render({ type: "error", message: "boom" });
    });

    expect(getActivityStates()).toEqual([
      { sessionId, state: "thinking" },
      { sessionId, state: "tool-error" },
    ]);
  });
});
