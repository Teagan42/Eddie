import { describe, expect, it, vi } from "vitest";
import type { ChatMessageDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import { ChatMessagePartialEvent, ChatMessagePartialEventHandler } from "../../../src/chat-sessions/events";
import { ChatSessionToolCallEvent, ChatSessionToolCallEventHandler, ChatSessionToolResultEvent, ChatSessionToolResultEventHandler } from "../../../src/chat-sessions/events";
import type { ChatMessagesGateway } from "../../../src/chat-sessions/chat-messages.gateway";
import type { ToolsGateway } from "../../../src/tools/tools.gateway";

describe("ChatMessagePartialEventHandler", () => {
  it("forwards partial message payloads through the gateway", () => {
    const gateway = { emitPartial: vi.fn() } as unknown as ChatMessagesGateway;
    const handler = new ChatMessagePartialEventHandler(gateway);
    const message = { id: "m1" } as ChatMessageDto;

    handler.handle(new ChatMessagePartialEvent(message));

    expect((gateway.emitPartial as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(message);
  });
});

describe("ChatSessionToolCallEventHandler", () => {
  it("forwards tool call payloads through the tools gateway", () => {
    const gateway = { emitToolCall: vi.fn() } as unknown as ToolsGateway;
    const handler = new ChatSessionToolCallEventHandler(gateway);
    const payload = { sessionId: "s1" } as ChatSessionToolCallEvent["payload"];

    handler.handle(new ChatSessionToolCallEvent(payload));

    expect((gateway.emitToolCall as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(payload);
  });
});

describe("ChatSessionToolResultEventHandler", () => {
  it("forwards tool result payloads through the tools gateway", () => {
    const gateway = { emitToolResult: vi.fn() } as unknown as ToolsGateway;
    const handler = new ChatSessionToolResultEventHandler(gateway);
    const payload = { sessionId: "s1" } as ChatSessionToolResultEvent["payload"];

    handler.handle(new ChatSessionToolResultEvent(payload));

    expect((gateway.emitToolResult as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(payload);
  });
});
