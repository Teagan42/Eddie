import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandBus } from "@nestjs/cqrs";
import { ChatSessionsGateway } from "../../../src/chat-sessions/chat-sessions.gateway";
import type { ChatMessageDto, ChatSessionDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import * as websocketUtils from "../../../src/websocket/utils";
import { SendChatMessageCommand } from "../../../src/chat-sessions/commands/send-chat-message.command";
import { SendChatMessagePayloadDto } from "../../../src/chat-sessions/dto/send-chat-message.dto";
import type { ExecutionTreeState } from "@eddie/types";

const emitEventSpy = vi.spyOn(websocketUtils, "emitEvent");

describe("ChatSessionsGateway", () => {
  let gateway: ChatSessionsGateway;
  let commandBus: Pick<CommandBus, "execute">;

  beforeEach(() => {
    commandBus = {
      execute: vi.fn(),
    };

    gateway = new ChatSessionsGateway(commandBus as CommandBus);
    (gateway as unknown as { server: unknown }).server = {
      clients: new Set(),
    } as unknown;

    emitEventSpy.mockClear();
  });

  it.skip("emits websocket events for deleted sessions", () => {
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

  it("emits websocket events for execution tree updates", () => {
    const server = (gateway as unknown as { server: unknown }).server;
    const state = createExecutionTreeState();

    gateway.emitExecutionTreeUpdated({
      sessionId: "session-1",
      state,
    });

    expect(emitEventSpy).toHaveBeenCalledWith(server, "execution-tree.updated", {
      sessionId: "session-1",
      state,
    });
  });

  it("dispatches send message commands via the command bus", async () => {
    const payload: SendChatMessagePayloadDto = {
      sessionId: "session-1",
      message: { role: "user", content: "Hi" },
    };

    await gateway.handleSendMessage(payload);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const command = (commandBus.execute as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(command).toBeInstanceOf(SendChatMessageCommand);
    expect(command).toMatchObject({ sessionId: payload.sessionId, dto: payload.message });
  });
});

function createExecutionTreeState(): ExecutionTreeState {
  return {
    agentHierarchy: [],
    toolInvocations: [],
    contextBundles: [],
    agentLineageById: {},
    toolGroupsByAgentId: {},
    contextBundlesByAgentId: {},
    contextBundlesByToolCallId: {},
    createdAt: "2024-04-01T00:00:00.000Z",
    updatedAt: "2024-04-01T00:00:00.000Z",
  } satisfies ExecutionTreeState;
}
