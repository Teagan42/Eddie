import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type {
  ApiClient,
  ChatMessageDto,
  ChatMessageReasoningPayload,
} from "@eddie/api-client";
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
    const reasoningPartialHandlers: Array<
      (payload: ChatMessageReasoningPayload) => void
    > = [];
    const reasoningCompleteHandlers: Array<
      (payload: ChatMessageReasoningPayload) => void
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
            handler: (payload: ChatMessageReasoningPayload) => void
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
            handler: (payload: ChatMessageReasoningPayload) => void
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

  it("accumulates reasoning partial segments into cached message entries", () => {
    const sessionId = "session-1";
    const messageId = "message-1";
    const queryClient = new QueryClient();
    const initialMessage = {
      id: messageId,
      sessionId,
      role: "assistant",
      content: "Hello",
      createdAt: new Date().toISOString(),
    } as ChatMessageDto & { reasoning?: unknown };

    queryClient.setQueryData<ChatMessageDto[]>(
      ["chat-session", sessionId, "messages"],
      [initialMessage]
    );

    const partialHandlers: Array<(message: ChatMessageDto) => void> = [];
    const reasoningPartialHandlers: Array<
      (payload: ChatMessageReasoningPayload) => void
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
            handler: (payload: ChatMessageReasoningPayload) => void
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

    expect(reasoningPartialHandlers).toHaveLength(1);
    const emitPartial = reasoningPartialHandlers[0];
    const timestamp = new Date("2024-01-01T00:00:00.000Z").toISOString();

    act(() => {
      emitPartial?.({
        sessionId,
        messageId,
        text: "Thinking",
        metadata: { step: 1 },
        timestamp,
        agentId: "agent-1",
      });
      emitPartial?.({
        sessionId,
        messageId,
        text: " deeper",
        metadata: { detail: "second" },
        timestamp,
        agentId: "agent-1",
      });
    });

    const cached = queryClient.getQueryData<
      Array<ChatMessageDto & { reasoning?: ChatMessageReasoningPayload }>
    >(["chat-session", sessionId, "messages"]);

    expect(cached).toHaveLength(1);
    expect(cached?.[0]?.reasoning).toEqual({
      sessionId,
      messageId,
      text: "Thinking deeper",
      metadata: { step: 1, detail: "second" },
      timestamp,
      agentId: "agent-1",
    });

    queryClient.clear();
  });

  it("removes reasoning state when completion events arrive", () => {
    const sessionId = "session-1";
    const messageId = "message-1";
    const timestamp = new Date("2024-02-01T00:00:00.000Z").toISOString();
    const queryClient = new QueryClient();
    const initialMessage = {
      id: messageId,
      sessionId,
      role: "assistant",
      content: "Hello",
      createdAt: timestamp,
    } as ChatMessageDto & { reasoning?: unknown };

    queryClient.setQueryData<ChatMessageDto[]>(
      ["chat-session", sessionId, "messages"],
      [initialMessage]
    );

    const reasoningPartialHandlers: Array<
      (payload: ChatMessageReasoningPayload) => void
    > = [];
    const reasoningCompleteHandlers: Array<
      (payload: ChatMessageReasoningPayload) => void
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
          onMessagePartial: vi.fn(),
          onReasoningPartial(
            handler: (payload: ChatMessageReasoningPayload) => void
          ) {
            reasoningPartialHandlers.push(handler);
            return () => {};
          },
          onReasoningComplete(
            handler: (payload: ChatMessageReasoningPayload) => void
          ) {
            reasoningCompleteHandlers.push(handler);
            return () => {};
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

    const emitPartial = reasoningPartialHandlers[0];
    const emitComplete = reasoningCompleteHandlers[0];

    expect(emitPartial).toBeDefined();
    expect(emitComplete).toBeDefined();

    act(() => {
      emitPartial?.({
        sessionId,
        messageId,
        text: "Reasoning",
        metadata: { step: 1 },
        timestamp,
      });
    });

    let cached = queryClient.getQueryData<
      Array<ChatMessageDto & { reasoning?: ChatMessageReasoningPayload }>
    >(["chat-session", sessionId, "messages"]);
    expect(cached?.[0]?.reasoning).toBeDefined();

    act(() => {
      emitComplete?.({
        sessionId,
        messageId,
        text: "Reasoning",
        metadata: { step: 1 },
        timestamp,
      });
    });

    cached = queryClient.getQueryData<
      Array<ChatMessageDto & { reasoning?: ChatMessageReasoningPayload }>
    >(["chat-session", sessionId, "messages"]);

    expect(cached).toHaveLength(1);
    expect("reasoning" in (cached?.[0] ?? {})).toBe(false);

    queryClient.clear();
  });
});
