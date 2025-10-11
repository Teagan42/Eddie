import { describe, expect, it, vi } from "vitest";
import { ChatSessionEventsService } from "../../../src/chat-sessions/chat-session-events.service";
import type { ChatMessagesGateway } from "../../../src/chat-sessions/chat-messages.gateway";
import type { ToolsGateway } from "../../../src/tools/tools.gateway";
import type { ChatMessageDto } from "../../../src/chat-sessions/dto/chat-session.dto";

describe("ChatSessionEventsService", () => {
    const sampleMessage = { id: "m1" } as unknown as ChatMessageDto;

    it("emits partial messages through the chat messages gateway", () => {
        const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
        const events = new ChatSessionEventsService(gateway);

        events.emitPartial(sampleMessage);

        expect((gateway.emitPartial as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(sampleMessage);
    });

    it("emits tool events when the tools gateway is provided", () => {
        const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
        const tools = { emitToolCall: vi.fn(), emitToolResult: vi.fn() } as unknown as ToolsGateway;
        const events = new ChatSessionEventsService(gateway, tools);

        const callPayload = { sessionId: "s1" };
        const resultPayload = { sessionId: "s1", result: "ok" };

        events.emitToolCall(callPayload);
        events.emitToolResult(resultPayload);

        expect((tools.emitToolCall as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(callPayload);
        expect((tools.emitToolResult as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(resultPayload);
    });

    it("ignores tool events when the tools gateway is absent", () => {
        const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
        const events = new ChatSessionEventsService(gateway);

        expect(() => events.emitToolCall({})).not.toThrow();
        expect(() => events.emitToolResult({})).not.toThrow();
    });
});
