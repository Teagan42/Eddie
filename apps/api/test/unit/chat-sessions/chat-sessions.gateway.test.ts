import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandBus } from "@nestjs/cqrs";
import { ChatSessionsGateway } from "../../../src/chat-sessions/chat-sessions.gateway";
import type { ChatMessageDto, ChatSessionDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import type { AgentActivityState } from "../../../src/chat-sessions/chat-session.types";
import * as websocketUtils from "../../../src/websocket/utils";
import { SendChatMessageCommand } from "../../../src/chat-sessions/commands/send-chat-message.command";
import { SendChatMessagePayloadDto } from "../../../src/chat-sessions/dto/send-chat-message.dto";
import type { ExecutionTreeState } from "@eddie/types";

const emitEventSpy = vi.spyOn(websocketUtils, "emitEvent");

const buildSession = (overrides: Partial<ChatSessionDto> = {}): ChatSessionDto => ({
  id: "session-1",
  title: "Test",
  status: "active",
  description: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const getServer = (instance: ChatSessionsGateway) =>
  (instance as unknown as { server: unknown }).server;

const buildMessage = (overrides: Partial<ChatMessageDto> = {}): ChatMessageDto => ({
  id: "message-1",
  sessionId: "session-1",
  role: "assistant",
  content: "Hello",
  createdAt: new Date().toISOString(),
  ...overrides,
});

const buildActivity = (
  overrides: Partial<{
    sessionId: string;
    state: AgentActivityState;
    timestamp: string;
  }> = {}
) => ({
  sessionId: "session-1",
  state: "thinking" as AgentActivityState,
  timestamp: new Date().toISOString(),
  ...overrides,
});

const buildExecutionTreeUpdate = (
  state: ExecutionTreeState,
  overrides: Partial<{ sessionId: string; state: ExecutionTreeState }> = {}
) => ({
  sessionId: "session-1",
  state,
  ...overrides,
});

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

  it("emits websocket events for deleted sessions", () => {
    const server = getServer(gateway);

    const sessionId = "session-1";

    (gateway as unknown as {
      emitSessionDeleted: (id: string) => void;
    }).emitSessionDeleted(sessionId);

    expect(emitEventSpy).toHaveBeenCalledWith(server, "session.deleted", {
      id: sessionId,
    });
  });

  it("emits raw session payloads for created sessions", () => {
    const server = getServer(gateway);
    const session = buildSession();

    gateway.emitSessionCreated(session);

    expect(emitEventSpy).toHaveBeenCalledWith(
      server,
      "session.created",
      session
    );
  });

  it("emits raw session payloads for updated sessions", () => {
    const server = (gateway as unknown as { server: unknown }).server;
    const session = buildSession();

    gateway.emitSessionUpdated(session);

    expect(emitEventSpy).toHaveBeenCalledWith(
      server,
      "session.updated",
      session
    );
  });

  it("emits raw message payloads for created messages", () => {
    const server = (gateway as unknown as { server: unknown }).server;
    const message = buildMessage();

    gateway.emitMessageCreated(message);

    expect(emitEventSpy).toHaveBeenCalledWith(
      server,
      "message.created",
      message
    );
  });

  it("emits raw message payloads for updated messages", () => {
    const server = (gateway as unknown as { server: unknown }).server;
    const message = buildMessage();

    gateway.emitMessageUpdated(message);

    expect(emitEventSpy).toHaveBeenCalledWith(
      server,
      "message.updated",
      message
    );
  });

  it("emits raw activity payloads for agent activity", () => {
    const server = getServer(gateway);

    const activity = buildActivity();

    gateway.emitAgentActivity(activity);

    expect(emitEventSpy).toHaveBeenCalledWith(
      server,
      "agent.activity",
      activity
    );
  });

  it("emits raw update payloads for execution tree updates", () => {
    const server = getServer(gateway);
    const state = createExecutionTreeState();

    const update = buildExecutionTreeUpdate(state);

    gateway.emitExecutionTreeUpdated(update);

    expect(emitEventSpy).toHaveBeenCalledWith(
      server,
      "execution-tree.updated",
      update
    );
  });

  it("dispatches send message commands via the command bus", async () => {
    const payload: SendChatMessagePayloadDto = {
      sessionId: "session-1",
      message: { role: "user", content: "Hi" },
    };

    await gateway.handleSendMessage(payload);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const executeMock = commandBus.execute as unknown as ReturnType<typeof vi.fn>;
    const command = executeMock.mock.calls[0]?.[0];

    expect(command).toBeInstanceOf(SendChatMessageCommand);
    expect(command).toMatchObject({ sessionId: payload.sessionId });
    expect(command?.dto).toEqual(payload.message);
    expect(command?.dto).not.toBe(payload.message);
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
