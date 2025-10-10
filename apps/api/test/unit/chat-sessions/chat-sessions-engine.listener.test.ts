import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineService, EngineResult } from "@eddie/engine";
import { ChatSessionsEngineListener } from "../../../src/chat-sessions/chat-sessions-engine.listener";
import { ChatSessionsService } from "../../../src/chat-sessions/chat-sessions.service";
import type { ChatSessionStreamRendererService } from "../../../src/chat-sessions/chat-session-stream-renderer.service";
import { ChatMessageRole } from "../../../src/chat-sessions/dto/create-chat-message.dto";
import type { ChatMessageDto } from "../../../src/chat-sessions/dto/chat-session.dto";
import type { LogsService } from "../../../src/logs/logs.service";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";
import type { TracesService } from "../../../src/traces/traces.service";

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
  const registerListener = vi.fn();
  const listMessages = vi.fn();
  const addMessage = vi.fn();
  const updateMessageContent = vi.fn();
  const saveAgentInvocations = vi.fn();
  const capture = vi.fn();
  let engineSetStreamRenderer: ReturnType<typeof vi.fn>;
  let engineRun: ReturnType<typeof vi.fn>;
  let tracesCreate: ReturnType<typeof vi.fn>;
  let tracesUpdateStatus: ReturnType<typeof vi.fn>;
  let logsAppend: ReturnType<typeof vi.fn>;
  let chatSessions: ChatSessionsService;
  let streamRenderer: ChatSessionStreamRendererService;
  let listener: ChatSessionsEngineListener;

  beforeEach(() => {
    registerListener.mockReset();
    listMessages.mockReset();
    addMessage.mockReset();
    updateMessageContent.mockReset();
    saveAgentInvocations.mockReset();
    capture.mockReset();

    listMessages.mockResolvedValue([]);
    addMessage.mockResolvedValue(undefined);
    updateMessageContent.mockResolvedValue(undefined);
    saveAgentInvocations.mockResolvedValue(undefined);

    chatSessions = {
      registerListener,
      listMessages,
      addMessage,
      updateMessageContent,
      saveAgentInvocations,
    } as unknown as ChatSessionsService;

    engineRun = vi.fn();
    engineSetStreamRenderer = vi.fn();
    const engine = {
      run: engineRun,
      setStreamRenderer: engineSetStreamRenderer,
    } as unknown as EngineService;

    tracesCreate = vi.fn();
    tracesUpdateStatus = vi.fn();
    const traces = {
      create: tracesCreate,
      updateStatus: tracesUpdateStatus,
    } as unknown as TracesService;
    const defaultTrace: TraceDto = {
      id: "trace-default",
      name: "engine.run",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tracesCreate.mockReturnValue(defaultTrace);

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
      traces,
      logs,
      streamRenderer
    );
  });

  it("registers and unregisters with the chat sessions service", () => {
    const unregister = vi.fn();
    registerListener.mockReturnValue(unregister);

    listener.onModuleInit();

    expect(registerListener).toHaveBeenCalledWith(listener);

    listener.onModuleDestroy();
    expect(unregister).toHaveBeenCalled();
  });

  it("registers the stream renderer with the engine", () => {
    expect(engineSetStreamRenderer).toHaveBeenCalledWith(streamRenderer);
  });

  it("ignores assistant messages", () => {
    const message = createChatMessage({ role: ChatMessageRole.Assistant });

    listener.onModuleInit();
    listener.onMessageCreated(message);

    expect(engineRun).not.toHaveBeenCalled();
  });

  it("invokes the engine with prior history and appends responses", async () => {
    const historyMessages = [
      createChatMessage({ id: "m-1", role: ChatMessageRole.User, content: "Earlier" }),
      createChatMessage({ id: "m-2", role: ChatMessageRole.Assistant, content: "Previous reply" }),
    ];
    const newMessage = createChatMessage({ id: "m-3" });

    listMessages.mockResolvedValue([...historyMessages, newMessage]);

    const trace: TraceDto = {
      id: "trace-success",
      name: "engine.run",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tracesCreate.mockReturnValue(trace);

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

    listener.onModuleInit();

    listener.onMessageCreated(newMessage);

    await new Promise((resolve) => setImmediate(resolve));

    expect(engineRun).toHaveBeenCalledWith("Execute plan", {
      history: [
        { role: ChatMessageRole.User, content: "Earlier" },
        { role: ChatMessageRole.Assistant, content: "Previous reply" },
      ],
      autoApprove: true,
      nonInteractive: true,
    });

    expect(addMessage).not.toHaveBeenCalledWith("session-1", {
      role: ChatMessageRole.Assistant,
      content: "Next steps",
    });
    expect(updateMessageContent).toHaveBeenCalledWith(
      "session-1",
      "assistant-1",
      "Next steps"
    );

    expect(tracesCreate).toHaveBeenCalledWith({
      sessionId: "session-1",
      name: "engine.run",
      status: "running",
      metadata: { messageId: "m-3" },
    });

    expect(tracesUpdateStatus).toHaveBeenCalledWith(
      "trace-success",
      "completed",
      expect.any(Number),
      expect.objectContaining({
        responseCount: 1,
      })
    );

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

  it("appends a failure message when the engine rejects", async () => {
    const message = createChatMessage();
    listMessages.mockResolvedValue([message]);
    engineRun.mockRejectedValue(new Error("boom"));

    const trace: TraceDto = {
      id: "trace-1",
      name: "engine.run",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    tracesCreate.mockReturnValue(trace);

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

    listener.onModuleInit();
    listener.onMessageCreated(message);

    await new Promise((resolve) => setImmediate(resolve));

    expect(updateMessageContent).toHaveBeenCalledWith(
      "session-1",
      "assistant-stream",
      "Engine failed to respond. Check server logs for details."
    );

    expect(saveAgentInvocations).not.toHaveBeenCalled();

    expect(tracesUpdateStatus).toHaveBeenCalledWith(
      "trace-1",
      "failed",
      undefined,
      expect.objectContaining({ error: "boom" })
    );

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
