import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSessionsGatewayEventsHandler } from "../../../src/chat-sessions/chat-sessions.gateway.events-handler";
import type { ChatSessionsGateway } from "../../../src/chat-sessions/chat-sessions.gateway";
import {
  AgentActivity,
  ChatMessageSent,
  ChatSessionCreated,
  ChatSessionDeleted,
  ChatSessionUpdated,
} from "../../../src/chat-sessions/events";
import type { ChatMessageDto, ChatSessionDto } from "../../../src/chat-sessions/dto/chat-session.dto";

describe("ChatSessionsGatewayEventsHandler", () => {
  let gateway: ChatSessionsGateway;
  let handler: ChatSessionsGatewayEventsHandler;

  const session: ChatSessionDto = {
    id: "session-1",
    title: "Title",
    status: "active",
    description: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const message: ChatMessageDto = {
    id: "message-1",
    sessionId: session.id,
    role: "assistant",
    content: "Hello",
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    gateway = {
      emitSessionCreated: vi.fn(),
      emitSessionUpdated: vi.fn(),
      emitSessionDeleted: vi.fn(),
      emitMessageCreated: vi.fn(),
      emitMessageUpdated: vi.fn(),
      emitAgentActivity: vi.fn(),
    } as unknown as ChatSessionsGateway;

    handler = new ChatSessionsGatewayEventsHandler(gateway);
  });

  it("forwards chat session creation events", () => {
    handler.handle(new ChatSessionCreated(session));

    expect(gateway.emitSessionCreated).toHaveBeenCalledWith(session);
  });

  it("forwards chat session updates", () => {
    handler.handle(new ChatSessionUpdated(session));

    expect(gateway.emitSessionUpdated).toHaveBeenCalledWith(session);
  });

  it("forwards chat session deletions", () => {
    handler.handle(new ChatSessionDeleted(session.id));

    expect(gateway.emitSessionDeleted).toHaveBeenCalledWith(session.id);
  });

  it("emits websocket events for new messages", () => {
    handler.handle(new ChatMessageSent(session.id, message, "created", session));

    expect(gateway.emitMessageCreated).toHaveBeenCalledWith(message);
    expect(gateway.emitSessionUpdated).not.toHaveBeenCalled();
  });

  it("emits websocket events for message updates", () => {
    handler.handle(new ChatMessageSent(session.id, message, "updated"));

    expect(gateway.emitMessageUpdated).toHaveBeenCalledWith(message);
  });

  it("forwards agent activity events", () => {
    const activity = new AgentActivity(session.id, "thinking", "2024-01-01T00:00:00.000Z");

    handler.handle(activity);

    expect(gateway.emitAgentActivity).toHaveBeenCalledWith({
      sessionId: session.id,
      state: "thinking",
      timestamp: "2024-01-01T00:00:00.000Z",
    });
  });
});
