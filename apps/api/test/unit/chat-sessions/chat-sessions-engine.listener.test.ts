import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandBus } from "@nestjs/cqrs";
import { EVENTS_HANDLER_METADATA } from "@nestjs/cqrs/dist/decorators/constants";
import type { EngineService, EngineResult } from "@eddie/engine";
import { ChatSessionsEngineListener } from "../../../src/chat-sessions/chat-sessions-engine.listener";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import type { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import type { ChatMessageDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import type { LogsService } from "../../../src/logs/logs.service";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";
import { CreateTraceCommand, UpdateTraceCommand } from "../../../src/traces/commands";
import { ChatMessageCreatedEvent } from "@eddie/types";
import { Type } from '@nestjs/common';

const createChatMessage = (
  overrides: Partial<ChatMessageDto> = {}
): ChatMessageDto => ({
  id: "message-1",
  sessionId: "session-1",
  role: ChatMessageRole.User,
  content: "Execute plan",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("ChatSessionsEngineListener", () => {
  const listMessages = vi.fn();
  const addMessage = vi.fn();
  const updateMessageContent = vi.fn();
  const saveAgentInvocations = vi.fn();
  const capture = vi.fn();
  let engineRun: ReturnType<typeof vi.fn>;
  let commandExecute: ReturnType<typeof vi.fn>;
  let logsAppend: ReturnType<typeof vi.fn>;
  let chatSessions: ChatSessionsService;
  let streamRenderer: ChatSessionStreamRendererService;
  let listener: ChatSessionsEngineListener;

  beforeEach(() => {
    listMessages.mockReset();
    addMessage.mockReset();
    updateMessageContent.mockReset();
    saveAgentInvocations.mockReset();
    capture.mockReset();
    listMessages.mockReturnValue([]);

    chatSessions = {
      listMessages,
      addMessage,
      updateMessageContent,
      saveAgentInvocations,
    } as unknown as ChatSessionsService;

    engineRun = vi.fn();
    const engine = {
      run: engineRun,
    } as unknown as EngineService;

    commandExecute = vi.fn();
    const commandBus = {
      execute: commandExecute,
    } as unknown as CommandBus;
    const defaultTrace: TraceDto = {
      id: "trace-default",
      name: "engine.run",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    commandExecute.mockImplementation((command: unknown) => {
      if (command instanceof CreateTraceCommand) {
        return defaultTrace;
      }
      return undefined;
    });

    logsAppend = vi.fn();
    const logs = {
      append: logsAppend,
    } as unknown as LogsService;

    streamRenderer = {
      capture,
    } as unknown as ChatSessionStreamRendererService;

    listener = new ChatSessionsEngineListener(
      chatSessions,
      engine,
      commandBus,
      logs,
      streamRenderer
    );
  });

  const findCommand = <T, TCtor extends Type<T> = Type<T>>(CommandType: TCtor): T | undefined =>
    commandExecute.mock.calls
      .map(([command]) => command)
      .find((command): command is T => command instanceof CommandType);

  it("subscribes to ChatMessageCreatedEvent", () => {
    const events =
      Reflect.getMetadata(
        EVENTS_HANDLER_METADATA,
        ChatSessionsEngineListener
      ) ?? [];

    expect(events).toContain(ChatMessageCreatedEvent);
  });

  it("ignores assistant messages", () => {
    const message = createChatMessage({ role: ChatMessageRole.Assistant });

    listener.handle(new ChatMessageCreatedEvent(message.sessionId, message.id));

    expect(engineRun).not.toHaveBeenCalled();
  });

  it("invokes the engine with prior history and appends responses", async () => {
    const historyMessages = [
      createChatMessage({ id: "m-1", role: ChatMessageRole.User, content: "Earlier" }),
      createChatMessage({ id: "m-2", role: ChatMessageRole.Assistant, content: "Previous reply" }),
    ];
    const newMessage = createChatMessage({ id: "m-3" });

    listMessages.mockReturnValue([...historyMessages, newMessage]);

    const trace: TraceDto = {
      id: "trace-success",
      name: "engine.run",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    commandExecute.mockImplementation((command: unknown) => {
      if (command instanceof CreateTraceCommand) {
        return trace;
      }
      return undefined;
    });

    const engineResult: EngineResult = {
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "Earlier" },
        { role: "assistant", content: "Previous reply" },
        { role: "user", content: "Execute plan" },
        { role: "assistant", content: "Next steps" },
      ],
      context: { files: [], totalBytes: 0, text: "" },
      agents: [],
    };

    engineRun.mockResolvedValue(engineResult);

    capture.mockImplementation(async (_sessionId: string, handler: () => Promise<EngineResult>) => {
      const result = await handler();
      return {
        result,
        error: undefined,
        state: {
          sessionId: "session-1",
          messageId: "assistant-1",
          buffer: "Next steps",
        },
      };
    });

    await listener.handle(
      new ChatMessageCreatedEvent(newMessage.sessionId, newMessage.id)
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(engineRun).toHaveBeenCalledWith(
      "Execute plan",
      expect.objectContaining({
        history: [
          { role: ChatMessageRole.User, content: "Earlier" },
          { role: ChatMessageRole.Assistant, content: "Previous reply" },
        ],
        autoApprove: true,
        nonInteractive: true,
        sessionId: "session-1",
      })
    );

    expect(addMessage).not.toHaveBeenCalledWith("session-1", {
      role: ChatMessageRole.Assistant,
      content: "Next steps",
    });
    expect(updateMessageContent).toHaveBeenCalledWith(
      "session-1",
      "assistant-1",
      "Next steps"
    );

    const createCommand: CreateTraceCommand | undefined = findCommand(CreateTraceCommand);
    expect(createCommand).toBeInstanceOf(CreateTraceCommand);
    expect(createCommand?.input).toEqual({
      sessionId: "session-1",
      name: "engine.run",
      status: "running",
      metadata: { messageId: "m-3" },
    });

    const updateCommand: UpdateTraceCommand | undefined = findCommand(UpdateTraceCommand);
    expect(updateCommand).toBeInstanceOf(UpdateTraceCommand);
    expect(updateCommand?.id).toBe("trace-success");
    expect(updateCommand?.input).toMatchObject({
      status: "completed",
      durationMs: expect.any(Number),
      metadata: expect.objectContaining({
        responseCount: 1,
      }),
    });

    expect(logsAppend).toHaveBeenCalledWith(
      "info",
      "Engine run started",
      expect.objectContaining({ sessionId: "session-1", messageId: "m-3" })
    );

    expect(logsAppend).toHaveBeenCalledWith(
      "info",
      "Engine run completed",
      expect.objectContaining({
        sessionId: "session-1",
        messageId: "m-3",
        responseCount: 1,
      })
    );

    expect(saveAgentInvocations).toHaveBeenCalledWith("session-1", []);
  });

  it("invokes the engine for developer-authored messages", async () => {
    const developerMessage = createChatMessage({
      id: "developer-message",
      role: "developer" as ChatMessageRole,
      content: "Adjust workflow",
    });

    listMessages.mockReturnValue([developerMessage]);

    const engineResult: EngineResult = {
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "Adjust workflow" },
        { role: "assistant", content: "Updated plan" },
      ],
      context: { files: [], totalBytes: 0, text: "" },
      agents: [],
    };

    engineRun.mockResolvedValue(engineResult);

    capture.mockImplementation(async (_sessionId: string, handler: () => Promise<EngineResult>) => {
      const result = await handler();
      return {
        result,
        error: undefined,
        state: {
          sessionId: developerMessage.sessionId,
          messageId: "assistant-1",
          buffer: "Updated plan",
        },
      };
    });

    await listener.handle(
      new ChatMessageCreatedEvent(developerMessage.sessionId, developerMessage.id)
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(engineRun).toHaveBeenCalledWith(
      "Adjust workflow",
      expect.objectContaining({ history: [] })
    );
  });

  it("captures agent runtime metadata in invocation snapshots", async () => {
    const message = createChatMessage();
    listMessages.mockReturnValue([message]);

    const managerInvocation = {
      id: "manager",
      parent: undefined,
      messages: [],
      children: [],
      runtime: {
        provider: "openai",
        model: "gpt-4o-mini",
      },
    } as unknown as EngineResult["agents"][number];

    const engineResult: EngineResult = {
      messages: [],
      context: { files: [], totalBytes: 0, text: "" },
      agents: [managerInvocation],
    };

    engineRun.mockResolvedValue(engineResult);

    capture.mockImplementation(async (_sessionId: string, handler: () => Promise<EngineResult>) => ({
      result: await handler(),
      error: undefined,
      state: { sessionId: "session-1", messageId: undefined, buffer: "" },
    }));

    await listener.handle(new ChatMessageCreatedEvent(message.sessionId, message.id));

    await new Promise((resolve) => setImmediate(resolve));

    expect(saveAgentInvocations).toHaveBeenCalledWith(
      "session-1",
      expect.arrayContaining([
        expect.objectContaining({
          id: "manager",
          provider: "openai",
          model: "gpt-4o-mini",
        }),
      ])
    );
  });

  it("appends a failure message when the engine rejects", async () => {
    const message = createChatMessage();
    listMessages.mockReturnValue([message]);
    engineRun.mockRejectedValue(new Error("boom"));

    const trace: TraceDto = {
      id: "trace-1",
      name: "engine.run",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    commandExecute.mockImplementation((command: unknown) => {
      if (command instanceof CreateTraceCommand) {
        return trace;
      }
      return undefined;
    });

    capture.mockImplementation(async (_sessionId: string, handler: () => Promise<EngineResult>) => {
      const state = {
        sessionId: "session-1",
        messageId: "assistant-stream",
        buffer: "Partial",
      };

      try {
        const result = await handler();
        return { result, error: undefined, state };
      } catch (error) {
        return { result: undefined, error, state };
      }
    });

    await listener.handle(
      new ChatMessageCreatedEvent(message.sessionId, message.id)
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(updateMessageContent).toHaveBeenCalledWith(
      "session-1",
      "assistant-stream",
      "Engine failed to respond. Check server logs for details."
    );

    expect(saveAgentInvocations).not.toHaveBeenCalled();

    const updateCommand: UpdateTraceCommand | undefined = findCommand(UpdateTraceCommand);
    expect(updateCommand).toBeInstanceOf(UpdateTraceCommand);
    expect(updateCommand?.id).toBe("trace-1");
    expect(updateCommand?.input).toMatchObject({
      status: "failed",
      durationMs: undefined,
      metadata: expect.objectContaining({ error: "boom" }),
    });

    expect(logsAppend).toHaveBeenCalledWith(
      "info",
      "Engine run started",
      expect.objectContaining({ sessionId: "session-1", messageId: "message-1" })
    );

    expect(logsAppend).toHaveBeenCalledWith(
      "error",
      "Engine run failed",
      expect.objectContaining({
        sessionId: "session-1",
        messageId: "message-1",
        error: "boom",
      })
    );
  });

});
