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
      text: "Evaluating options",
      metadata: { step: 1 },
      status: "streaming",
      agentId: "agent-1",
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
      text: "Ready to respond",
      metadata: { step: 2 },
      status: "completed",
      responseId: "resp-42",
      agentId: "agent-1",
    });

    queryClient.clear();
  });
});
