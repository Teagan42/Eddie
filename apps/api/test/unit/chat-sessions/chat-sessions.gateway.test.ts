import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import { ChatSessionsGateway } from "../../../src/chat-sessions/chat-sessions.gateway";
import type { ChatMessageDto, ChatSessionDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import * as websocketUtils from "../../../src/websocket/utils";

const emitEventSpy = vi.spyOn(websocketUtils, "emitEvent");

describe("ChatSessionsGateway", () => {
  let gateway: ChatSessionsGateway;

  beforeEach(() => {
    const service = {} as unknown as ChatSessionsService;

    gateway = new ChatSessionsGateway(service);
    (gateway as unknown as { server: unknown }).server = {
      clients: new Set(),
    } as unknown;

    emitEventSpy.mockClear();
  });

  it("emits websocket events for deleted sessions", () => {
    const server = (gateway as unknown as { server: unknown }).server;

    (gateway as unknown as {
      emitSessionDeleted: (id: string) => void;
    }).emitSessionDeleted("session-1");

    expect(emitEventSpy).toHaveBeenCalledWith(server, "session.deleted", {
      id: "session-1",
    });
  });

  it("emits websocket events for created sessions", () => {
    const server = (gateway as unknown as { server: unknown }).server;
    const session: ChatSessionDto = {
      id: "session-1",
      title: "Test",
      status: "active",
      description: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    gateway.emitSessionCreated(session);

    expect(emitEventSpy).toHaveBeenCalledWith(server, "session.created", session);
  });

  it("emits websocket events for updated sessions", () => {
    const server = (gateway as unknown as { server: unknown }).server;
    const session: ChatSessionDto = {
      id: "session-1",
      title: "Test",
      status: "active",
      description: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    gateway.emitSessionUpdated(session);

    expect(emitEventSpy).toHaveBeenCalledWith(server, "session.updated", session);
  });

  it("emits websocket events for created messages", () => {
    const server = (gateway as unknown as { server: unknown }).server;
    const message: ChatMessageDto = {
      id: "message-1",
      sessionId: "session-1",
      role: "assistant",
      content: "Hello",
      createdAt: new Date().toISOString(),
    };

    gateway.emitMessageCreated(message);

    expect(emitEventSpy).toHaveBeenCalledWith(server, "message.created", message);
  });

  it("emits websocket events for updated messages", () => {
    const server = (gateway as unknown as { server: unknown }).server;
    const message: ChatMessageDto = {
      id: "message-1",
      sessionId: "session-1",
      role: "assistant",
      content: "Hello",
      createdAt: new Date().toISOString(),
    };

    gateway.emitMessageUpdated(message);

    expect(emitEventSpy).toHaveBeenCalledWith(server, "message.updated", message);
  });

  it("emits websocket events for agent activity", () => {
    const server = (gateway as unknown as { server: unknown }).server;

    gateway.emitAgentActivity({
      sessionId: "session-1",
      state: "thinking",
      timestamp: new Date().toISOString(),
    });

    expect(emitEventSpy).toHaveBeenCalledWith(server, "agent.activity", {
      sessionId: "session-1",
      state: "thinking",
      timestamp: expect.any(String),
    });
  });
});
