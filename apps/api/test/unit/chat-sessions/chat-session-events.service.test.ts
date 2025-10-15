import { describe, expect, it, vi } from "vitest";
import type { CommandBus } from "@nestjs/cqrs";
import { ChatSessionEventsService } from "../../../src/chat-sessions/chat-session-events.service";
import type { ChatMessagesGateway } from "../../../src/chat-sessions/chat-messages.gateway";
import type { ChatMessageDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import {
  ChatMessagePartialEvent,
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
        const execute = vi.fn();
        const commandBus = { execute } as unknown as CommandBus;
        const events = new ChatSessionEventsService(gateway, commandBus);

        const callEvent = new ChatSessionToolCallEvent("s1", "t1", "tool", { input: "x" }, "2024-01-01T00:00:00.000Z");
        const resultEvent = new ChatSessionToolResultEvent("s1", "t1", "tool", "ok", "2024-01-01T00:00:00.000Z");

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
        });

        const [ completeCommand ] = execute.mock.calls[1] ?? [];
        expect(completeCommand).toBeInstanceOf(CompleteToolCallCommand);
        expect(completeCommand.input).toEqual({
            sessionId: "s1",
            toolCallId: "t1",
            name: "tool",
            result: "ok",
            timestamp: "2024-01-01T00:00:00.000Z",
        });
    });

    it("does not throw when no command bus is provided", () => {
        const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
        const events = new ChatSessionEventsService(gateway);

        expect(() => events.handle(new ChatSessionToolCallEvent("s1", "t1", "tool", {}, undefined))).not.toThrow();
        expect(() => events.handle(new ChatSessionToolResultEvent("s1", "t1", "tool", "ok", undefined))).not.toThrow();
    });
});
