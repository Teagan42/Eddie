import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { ApiClient, ChatMessageDto } from "@eddie/api-client";
import { useChatMessagesRealtime } from "./useChatMessagesRealtime";

function createWrapper(queryClient: QueryClient) {
  const QueryClientWrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  QueryClientWrapper.displayName = "QueryClientWrapper";
  return QueryClientWrapper;
}

describe("useChatMessagesRealtime", () => {
  it("updates cached messages when partial responses stream in", () => {
    const sessionId = "session-1";
    const queryClient = new QueryClient();
    queryClient.setQueryData<ChatMessageDto[]>(
      ["chat-session", sessionId, "messages"],
      []
    );

    const partialHandlers: Array<(message: ChatMessageDto) => void> = [];
    const api = {
      http: {} as ApiClient["http"],
      sockets: {
        chatSessions: {
          onSessionCreated: vi.fn(() => vi.fn()),
          onSessionUpdated: vi.fn(() => vi.fn()),
          onSessionDeleted: vi.fn(() => vi.fn()),
          onMessageCreated: vi.fn(() => vi.fn()),
          onMessageUpdated: vi.fn(() => vi.fn()),
          onAgentActivity: vi.fn(() => vi.fn()),
          emitMessage: vi.fn(),
        },
        chatMessages: {
          onMessagePartial(handler: (message: ChatMessageDto) => void) {
            partialHandlers.push(handler);
            return () => {
              const index = partialHandlers.indexOf(handler);
              if (index >= 0) {
                partialHandlers.splice(index, 1);
              }
            };
          },
        },
        traces: {} as ApiClient["sockets"]["traces"],
        logs: {} as ApiClient["sockets"]["logs"],
        config: {} as ApiClient["sockets"]["config"],
      },
      updateAuth: vi.fn(),
      dispose: vi.fn(),
    } as unknown as ApiClient;

    renderHook(() => useChatMessagesRealtime(api), {
      wrapper: createWrapper(queryClient),
    });

    const partial = partialHandlers[0];
    expect(partial).toBeDefined();

    act(() => {
      partial?.({
        id: "message-1",
        sessionId,
        role: "assistant",
        content: "Hello",
        createdAt: new Date().toISOString(),
      } as ChatMessageDto);
      partial?.({
        id: "message-1",
        sessionId,
        role: "assistant",
        content: "Hello world",
        createdAt: new Date().toISOString(),
      } as ChatMessageDto);
    });

    const cached = queryClient.getQueryData<ChatMessageDto[]>([
      "chat-session",
      sessionId,
      "messages",
    ]);

    expect(cached).toHaveLength(1);
    expect(cached?.[0]?.content).toBe("Hello world");

    queryClient.clear();
  });

  it("merges reasoning updates from realtime events", () => {
    const sessionId = "session-1";
    const messageId = "message-1";
    const queryClient = new QueryClient();
    const initialMessage = {
      id: messageId,
      sessionId,
      role: "assistant",
      content: "Hello",
      createdAt: new Date().toISOString(),
    } as ChatMessageDto;
    queryClient.setQueryData<ChatMessageDto[]>(
      ["chat-session", sessionId, "messages"],
      [initialMessage]
    );

    const partialHandlers: Array<(message: ChatMessageDto) => void> = [];
    const reasoningPartialHandlers: Array<
      (payload: {
        sessionId: string;
        messageId: string;
        text: string;
        metadata?: Record<string, unknown>;
        timestamp?: string;
        agentId?: string | null;
      }) => void
    > = [];
    const reasoningCompleteHandlers: Array<
      (payload: {
        sessionId: string;
        messageId: string;
        responseId?: string;
        text?: string;
        metadata?: Record<string, unknown>;
        timestamp?: string;
        agentId?: string | null;
      }) => void
    > = [];

    const api = {
      http: {} as ApiClient["http"],
      sockets: {
        chatSessions: {
          onSessionCreated: vi.fn(() => vi.fn()),
          onSessionUpdated: vi.fn(() => vi.fn()),
          onSessionDeleted: vi.fn(() => vi.fn()),
          onMessageCreated: vi.fn(() => vi.fn()),
          onMessageUpdated: vi.fn(() => vi.fn()),
          onAgentActivity: vi.fn(() => vi.fn()),
          emitMessage: vi.fn(),
        },
        chatMessages: {
          onMessagePartial(handler: (message: ChatMessageDto) => void) {
            partialHandlers.push(handler);
            return () => {
              const index = partialHandlers.indexOf(handler);
              if (index >= 0) {
                partialHandlers.splice(index, 1);
              }
            };
          },
          onReasoningPartial(
            handler: (payload: {
              sessionId: string;
              messageId: string;
              text: string;
              metadata?: Record<string, unknown>;
              timestamp?: string;
              agentId?: string | null;
            }) => void,
          ) {
            reasoningPartialHandlers.push(handler);
            return () => {
              const index = reasoningPartialHandlers.indexOf(handler);
              if (index >= 0) {
                reasoningPartialHandlers.splice(index, 1);
              }
            };
          },
          onReasoningComplete(
            handler: (payload: {
              sessionId: string;
              messageId: string;
              responseId?: string;
              text?: string;
              metadata?: Record<string, unknown>;
              timestamp?: string;
              agentId?: string | null;
            }) => void,
          ) {
            reasoningCompleteHandlers.push(handler);
            return () => {
              const index = reasoningCompleteHandlers.indexOf(handler);
              if (index >= 0) {
                reasoningCompleteHandlers.splice(index, 1);
              }
            };
          },
        },
        traces: {} as ApiClient["sockets"]["traces"],
        logs: {} as ApiClient["sockets"]["logs"],
        config: {} as ApiClient["sockets"]["config"],
      },
      updateAuth: vi.fn(),
      dispose: vi.fn(),
    } as unknown as ApiClient;

    renderHook(() => useChatMessagesRealtime(api), {
      wrapper: createWrapper(queryClient),
    });

    const partialPayload = {
      sessionId,
      messageId,
      text: "Evaluating options",
      metadata: { step: 1 },
      timestamp: new Date().toISOString(),
      agentId: "agent-1",
    };

    act(() => {
      reasoningPartialHandlers.forEach((handler) => handler(partialPayload));
    });

    type MessageWithReasoning = ChatMessageDto & {
      reasoning?: {
        text?: string;
        metadata?: Record<string, unknown>;
        status?: string;
        responseId?: string;
        agentId?: string | null;
      } | null;
    };

    let cached = queryClient.getQueryData<MessageWithReasoning[]>([
      "chat-session",
      sessionId,
      "messages",
    ]);

    expect(cached?.[0]?.reasoning).toMatchObject({
      status: "streaming",
      segments: [
        {
          text: "Evaluating options",
          metadata: { step: 1 },
          timestamp: partialPayload.timestamp,
          agentId: "agent-1",
        },
      ],
    });

    const completionPayload = {
      sessionId,
      messageId,
      responseId: "resp-42",
      text: "Ready to respond",
      metadata: { step: 2 },
      timestamp: new Date().toISOString(),
      agentId: "agent-1",
    };

    act(() => {
      reasoningCompleteHandlers.forEach((handler) => handler(completionPayload));
    });

    cached = queryClient.getQueryData<MessageWithReasoning[]>([
      "chat-session",
      sessionId,
      "messages",
    ]);

    expect(cached?.[0]?.reasoning).toMatchObject({
      status: "completed",
      responseId: "resp-42",
      segments: [
        {
          text: "Evaluating options",
          metadata: { step: 1 },
          timestamp: partialPayload.timestamp,
          agentId: "agent-1",
        },
        {
          text: "Ready to respond",
          metadata: { step: 2 },
          timestamp: completionPayload.timestamp,
          agentId: "agent-1",
        },
      ],
    });

    queryClient.clear();
  });


  it("updates streaming reasoning segments in place when text grows", () => {
    const sessionId = "session-3";
    const messageId = "message-99";
    const queryClient = new QueryClient();
    const initialMessage = {
      id: messageId,
      sessionId,
      role: "assistant",
      content: "Hello",
      createdAt: new Date().toISOString(),
    } as ChatMessageDto;

    queryClient.setQueryData<ChatMessageDto[]>(
      ["chat-session", sessionId, "messages"],
      [initialMessage]
    );

    const reasoningPartialHandlers: Array<
      (payload: {
        sessionId: string;
        messageId: string;
        text: string;
        metadata?: Record<string, unknown>;
        timestamp?: string;
        agentId?: string | null;
      }) => void
    > = [];

    const api = {
      http: {} as ApiClient["http"],
      sockets: {
        chatSessions: {
          onSessionCreated: vi.fn(() => vi.fn()),
          onSessionUpdated: vi.fn(() => vi.fn()),
          onSessionDeleted: vi.fn(() => vi.fn()),
          onMessageCreated: vi.fn(() => vi.fn()),
          onMessageUpdated: vi.fn(() => vi.fn()),
          onAgentActivity: vi.fn(() => vi.fn()),
          emitMessage: vi.fn(),
        },
        chatMessages: {
          onMessagePartial: vi.fn(() => vi.fn()),
          onReasoningPartial(
            handler: (payload: {
              sessionId: string;
              messageId: string;
              text: string;
              metadata?: Record<string, unknown>;
              timestamp?: string;
              agentId?: string | null;
            }) => void,
          ) {
            reasoningPartialHandlers.push(handler);
            return () => {
              const index = reasoningPartialHandlers.indexOf(handler);
              if (index >= 0) {
                reasoningPartialHandlers.splice(index, 1);
              }
            };
          },
        },
        traces: {} as ApiClient["sockets"]["traces"],
        logs: {} as ApiClient["sockets"]["logs"],
        config: {} as ApiClient["sockets"]["config"],
      },
      updateAuth: vi.fn(),
      dispose: vi.fn(),
    } as unknown as ApiClient;

    renderHook(() => useChatMessagesRealtime(api), {
      wrapper: createWrapper(queryClient),
    });

    const firstTimestamp = "2024-02-01T10:00:00.000Z";
    const secondTimestamp = "2024-02-01T10:00:05.000Z";

    act(() => {
      reasoningPartialHandlers.forEach((handler) =>
        handler({
          sessionId,
          messageId,
          text: "Gathering evidence",
          metadata: { step: 1 },
          timestamp: firstTimestamp,
          agentId: "agent-1",
        })
      );
    });

    act(() => {
      reasoningPartialHandlers.forEach((handler) =>
        handler({
          sessionId,
          messageId,
          text: "Gathering evidence with new insight",
          metadata: { step: 2 },
          timestamp: secondTimestamp,
          agentId: "agent-1",
        })
      );
    });

    type MessageWithReasoning = ChatMessageDto & {
      reasoning?: {
        segments?: Array<{
          text?: string;
          metadata?: Record<string, unknown>;
          timestamp?: string;
          agentId?: string | null;
        }>;
        status?: string;
      } | null;
    };

    const cached = queryClient.getQueryData<MessageWithReasoning[]>([
      "chat-session",
      sessionId,
      "messages",
    ]);

    expect(cached?.[0]?.reasoning?.segments).toHaveLength(1);
    expect(cached?.[0]?.reasoning?.segments?.[0]).toMatchObject({
      text: "Gathering evidence with new insight",
      metadata: { step: 2 },
      timestamp: secondTimestamp,
      agentId: "agent-1",
    });
    expect(cached?.[0]?.reasoning?.status).toBe("streaming");

    queryClient.clear();
  });

  it("merges metadata-only partial reasoning updates into the active segment", () => {
    const sessionId = "session-2";
    const messageId = "message-42";
    const queryClient = new QueryClient();
    const initialMessage = {
      id: messageId,
      sessionId,
      role: "assistant",
      content: "Working on it",
      createdAt: new Date().toISOString(),
    } as ChatMessageDto;

    queryClient.setQueryData<ChatMessageDto[]>(
      ["chat-session", sessionId, "messages"],
      [initialMessage]
    );

    const reasoningPartialHandlers: Array<
      (payload: {
        sessionId: string;
        messageId: string;
        text: string;
        metadata?: Record<string, unknown>;
        timestamp?: string;
        agentId?: string | null;
      }) => void
    > = [];

    const api = {
      http: {} as ApiClient["http"],
      sockets: {
        chatSessions: {
          onSessionCreated: vi.fn(() => vi.fn()),
          onSessionUpdated: vi.fn(() => vi.fn()),
          onSessionDeleted: vi.fn(() => vi.fn()),
          onMessageCreated: vi.fn(() => vi.fn()),
          onMessageUpdated: vi.fn(() => vi.fn()),
          onAgentActivity: vi.fn(() => vi.fn()),
          emitMessage: vi.fn(),
        },
        chatMessages: {
          onMessagePartial: vi.fn(() => vi.fn()),
          onReasoningPartial(
            handler: (payload: {
              sessionId: string;
              messageId: string;
              text: string;
              metadata?: Record<string, unknown>;
              timestamp?: string;
              agentId?: string | null;
            }) => void,
          ) {
            reasoningPartialHandlers.push(handler);
            return () => {
              const index = reasoningPartialHandlers.indexOf(handler);
              if (index >= 0) {
                reasoningPartialHandlers.splice(index, 1);
              }
            };
          },
        },
        traces: {} as ApiClient["sockets"]["traces"],
        logs: {} as ApiClient["sockets"]["logs"],
        config: {} as ApiClient["sockets"]["config"],
      },
      updateAuth: vi.fn(),
      dispose: vi.fn(),
    } as unknown as ApiClient;

    renderHook(() => useChatMessagesRealtime(api), {
      wrapper: createWrapper(queryClient),
    });

    const firstTimestamp = "2024-01-01T12:00:00.000Z";
    const secondTimestamp = "2024-01-01T12:01:00.000Z";

    act(() => {
      reasoningPartialHandlers.forEach((handler) =>
        handler({
          sessionId,
          messageId,
          text: "Considering responses",
          metadata: { step: 1 },
          timestamp: firstTimestamp,
          agentId: "agent-initial",
        })
      );
    });

    act(() => {
      reasoningPartialHandlers.forEach((handler) =>
        handler({
          sessionId,
          messageId,
          text: "",
          metadata: { detail: "searching" },
          timestamp: secondTimestamp,
          agentId: "agent-updated",
        })
      );
    });

    type MessageWithReasoning = ChatMessageDto & {
      reasoning?: {
        segments?: Array<{
          text?: string;
          metadata?: Record<string, unknown>;
          timestamp?: string;
          agentId?: string | null;
        }>;
        status?: string;
      } | null;
    };

    const cached = queryClient.getQueryData<MessageWithReasoning[]>([
      "chat-session",
      sessionId,
      "messages",
    ]);

    expect(cached?.[0]?.reasoning?.segments).toEqual([
      {
        text: "Considering responses",
        metadata: { detail: "searching" },
        timestamp: secondTimestamp,
        agentId: "agent-updated",
      },
    ]);

    queryClient.clear();
  });
});
