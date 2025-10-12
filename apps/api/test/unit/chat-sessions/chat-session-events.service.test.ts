import { describe, expect, it, vi } from "vitest";
import { ChatSessionEventsService } from "../../../src/chat-sessions/chat-session-events.service";
import type { ChatMessagesGateway } from "../../../src/chat-sessions/chat-messages.gateway";
import type { ToolsGateway } from "../../../src/tools/tools.gateway";
import type { ChatMessageDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import {
  ChatMessagePartialEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
} from "@eddie/types";

describe("ChatSessionEventsService", () => {
    const sampleMessage = { id: "m1" } as unknown as ChatMessageDto;

    it("forwards partial events to the chat messages gateway", () => {
        const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
        const events = new ChatSessionEventsService(gateway);

        events.handle(new ChatMessagePartialEvent(sampleMessage));

        expect((gateway.emitPartial as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(sampleMessage);
    });

    it("forwards tool events when the tools gateway is provided", () => {
        const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
        const tools = { emitToolCall: vi.fn(), emitToolResult: vi.fn() } as unknown as ToolsGateway;
        const events = new ChatSessionEventsService(gateway, tools);

        const callEvent = new ChatSessionToolCallEvent("s1", "t1", "tool", {}, "2024-01-01T00:00:00.000Z");
        const resultEvent = new ChatSessionToolResultEvent("s1", "t1", "tool", "ok", "2024-01-01T00:00:00.000Z");

        events.handle(callEvent);
        events.handle(resultEvent);

        expect((tools.emitToolCall as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
            sessionId: "s1",
            id: "t1",
            name: "tool",
            arguments: {},
            timestamp: "2024-01-01T00:00:00.000Z",
        });
        expect((tools.emitToolResult as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
            sessionId: "s1",
            id: "t1",
            name: "tool",
            result: "ok",
            timestamp: "2024-01-01T00:00:00.000Z",
        });
    });

    it("ignores tool events when the tools gateway is absent", () => {
        const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
        const events = new ChatSessionEventsService(gateway);

        expect(() => events.handle(new ChatSessionToolCallEvent("s1", "t1", "tool", {}, undefined))).not.toThrow();
        expect(() => events.handle(new ChatSessionToolResultEvent("s1", "t1", "tool", "ok", undefined))).not.toThrow();
    });
});
