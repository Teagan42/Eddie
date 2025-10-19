import { describe, expect, it, vi } from "vitest";
import type { CommandBus } from "@nestjs/cqrs";
import { ChatSessionEventsService } from "../../../src/chat-sessions/chat-session-events.service";
import type { ChatMessagesGateway } from "../../../src/chat-sessions/chat-messages.gateway";
import type { ChatMessageDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import {
  ChatMessagePartialEvent,
  ChatMessageReasoningCompleteEvent,
  ChatMessageReasoningDeltaEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
} from "@eddie/types";
import { StartToolCallCommand } from "../../../src/tools/commands/start-tool-call.command";
import { CompleteToolCallCommand } from "../../../src/tools/commands/complete-tool-call.command";

describe("ChatSessionEventsService", () => {
  const sampleMessage = { id: "m1" } as unknown as ChatMessageDto;

  it("forwards partial events to the chat messages gateway", () => {
    const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
    const events = new ChatSessionEventsService(gateway);

    events.handle(new ChatMessagePartialEvent(sampleMessage));

    expect((gateway.emitPartial as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(sampleMessage);
  });

  it("dispatches tool commands for tool events", () => {
    const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
    let catchAccessed = false;
    const execute = vi.fn(() => {
      const result: Record<string, unknown> = {};
      Object.defineProperty(result, "catch", {
        get() {
          catchAccessed = true;
          throw new Error("should not access catch on non-promise");
        },
      });
      return result;
    });
    const commandBus = { execute } as unknown as CommandBus;
    const events = new ChatSessionEventsService(gateway, commandBus);

    const callEvent = new ChatSessionToolCallEvent(
      "s1",
      "t1",
      "tool",
      { input: "x" },
      "2024-01-01T00:00:00.000Z",
      "agent-42",
    );
    const resultEvent = new ChatSessionToolResultEvent(
      "s1",
      "t1",
      "tool",
      "ok",
      "2024-01-01T00:00:00.000Z",
      "agent-42",
    );

    events.handle(callEvent);
    events.handle(resultEvent);

    const [ startCommand ] = execute.mock.calls[0] ?? [];
    expect(startCommand).toBeInstanceOf(StartToolCallCommand);
    expect(startCommand.input).toEqual({
      sessionId: "s1",
      toolCallId: "t1",
      name: "tool",
      arguments: { input: "x" },
      timestamp: "2024-01-01T00:00:00.000Z",
      agentId: "agent-42",
    });

    const [ completeCommand ] = execute.mock.calls[1] ?? [];
    expect(completeCommand).toBeInstanceOf(CompleteToolCallCommand);
    expect(completeCommand.input).toEqual({
      sessionId: "s1",
      toolCallId: "t1",
      name: "tool",
      result: "ok",
      timestamp: "2024-01-01T00:00:00.000Z",
      agentId: "agent-42",
    });

    expect(catchAccessed).toBe(false);
  });

  it("does not throw when no command bus is provided", () => {
    const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
    const events = new ChatSessionEventsService(gateway);

    expect(() =>
      events.handle(
        new ChatSessionToolCallEvent("s1", "t1", "tool", {}, undefined, "agent-42"),
      ),
    ).not.toThrow();
    expect(() =>
      events.handle(
        new ChatSessionToolResultEvent("s1", "t1", "tool", "ok", undefined, "agent-42"),
      ),
    ).not.toThrow();
  });

  it("forwards reasoning deltas to the chat messages gateway", () => {
    const gateway = {
      emitPartial: vi.fn(),
      emitReasoningPartial: vi.fn(),
    } as unknown as ChatMessagesGateway;
    const events = new ChatSessionEventsService(gateway);

    const reasoning = new ChatMessageReasoningDeltaEvent(
      "s1",
      "m1",
      "Thinking",
      { step: 1 },
      "2024-01-01T00:00:00.000Z",
      "agent-7",
    );

    events.handle(reasoning);

    expect((gateway.emitReasoningPartial as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      sessionId: "s1",
      messageId: "m1",
      text: "Thinking",
      metadata: { step: 1 },
      timestamp: "2024-01-01T00:00:00.000Z",
      agentId: "agent-7",
    });
  });

  it("forwards reasoning completions to the chat messages gateway", () => {
    const gateway = {
      emitPartial: vi.fn(),
      emitReasoningComplete: vi.fn(),
    } as unknown as ChatMessagesGateway;
    const events = new ChatSessionEventsService(gateway);

    const completion = new ChatMessageReasoningCompleteEvent(
      "s1",
      "m1",
      "resp-9",
      "Thinking complete",
      { step: 2 },
      "2024-01-01T00:00:01.000Z",
      "agent-7",
    );

    events.handle(completion);

    expect((gateway.emitReasoningComplete as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s1",
        messageId: "m1",
        responseId: "resp-9",
        metadata: { step: 2 },
        timestamp: "2024-01-01T00:00:01.000Z",
        agentId: "agent-7",
        text: "Thinking complete",
      })
    );
  });
});
