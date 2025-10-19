import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ApiClient,
  ChatMessageDto,
  ChatMessageReasoningPayload,
  ChatSessionDto,
} from "@eddie/api-client";
import { sortSessions, upsertMessage } from "./chat-utils";

function updateMessageCache(queryClient: QueryClient, message: ChatMessageDto): void {
  queryClient.setQueryData<ChatMessageDto[] | undefined>(
    ["chat-session", message.sessionId, "messages"],
    (previous = []) => upsertMessage(previous, message)
  );
}

type MessageWithReasoning = ChatMessageDto & {
  reasoning?: MessageReasoningState | null;
};

type MessageReasoningState = {
  sessionId: string;
  messageId: string;
  text: string;
  metadata?: Record<string, unknown>;
  agentId?: string | null;
  timestamp?: string;
  responseId?: string;
};

function mergeMetadata(
  current: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!incoming || Object.keys(incoming).length === 0) {
    return current && Object.keys(current).length > 0 ? current : undefined;
  }

  const merged = { ...(current ?? {}) } as Record<string, unknown>;

  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = value;
  }

  return Object.keys(merged).length === 0 ? undefined : merged;
}

function mergeReasoningState(
  current: MessageReasoningState | null | undefined,
  incoming: ChatMessageReasoningPayload
): MessageReasoningState {
  const text = `${current?.text ?? ""}${incoming.text ?? ""}`;
  const metadata = mergeMetadata(current?.metadata, incoming.metadata);
  const agentId =
    incoming.agentId !== undefined ? incoming.agentId : current?.agentId ?? null;
  const timestamp = incoming.timestamp ?? current?.timestamp;
  const responseId = incoming.responseId ?? current?.responseId;

  return {
    sessionId: incoming.sessionId,
    messageId: incoming.messageId,
    text,
    metadata,
    agentId,
    timestamp,
    responseId,
  };
}

function applyReasoningPartial(
  queryClient: QueryClient,
  payload: ChatMessageReasoningPayload
): void {
  queryClient.setQueryData<ChatMessageDto[] | undefined>(
    ["chat-session", payload.sessionId, "messages"],
    (previous = []) => {
      let updated = false;

      const next = previous.map((message) => {
        if (message.id !== payload.messageId) {
          return message;
        }

        updated = true;
        const messageWithReasoning = message as MessageWithReasoning;
        const mergedReasoning = mergeReasoningState(
          messageWithReasoning.reasoning,
          payload
        );

        return {
          ...messageWithReasoning,
          reasoning: mergedReasoning,
        } as MessageWithReasoning;
      });

      return updated ? next : previous;
    }
  );
}

function clearReasoningState(
  queryClient: QueryClient,
  payload: ChatMessageReasoningPayload
): void {
  queryClient.setQueryData<ChatMessageDto[] | undefined>(
    ["chat-session", payload.sessionId, "messages"],
    (previous = []) => {
      let updated = false;

      const next = previous.map((message) => {
        if (message.id !== payload.messageId) {
          return message;
        }

        const messageWithReasoning = message as MessageWithReasoning;
        if (!messageWithReasoning.reasoning) {
          return message;
        }

        updated = true;

        const { reasoning: reasoningState, ...messageWithoutReasoning } =
          messageWithReasoning;
        void reasoningState;

        return messageWithoutReasoning;
      });

      return updated ? next : previous;
    }
  );
}

function updateSessionCache(queryClient: QueryClient, session: ChatSessionDto): void {
  queryClient.setQueryData<ChatSessionDto[] | undefined>(
    ["chat-sessions"],
    (previous = []) =>
      sortSessions([
        session,
        ...previous.filter((item) => item.id !== session.id),
      ])
  );
}

function removeSessionFromCache(
  queryClient: QueryClient,
  sessionId: string
): void {
  queryClient.setQueryData<ChatSessionDto[] | undefined>(
    ["chat-sessions"],
    (previous = []) => previous.filter((item) => item.id !== sessionId)
  );
  queryClient.removeQueries({
    queryKey: ["chat-session", sessionId, "messages"],
  });
  queryClient.removeQueries({
    queryKey: ["chat-sessions", sessionId, "messages"],
  });
}

export function useChatMessagesRealtime(api: ApiClient): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribes = [
      api.sockets.chatSessions.onSessionCreated((session) => {
        updateSessionCache(queryClient, session);
      }),
      api.sockets.chatSessions.onSessionUpdated((session) => {
        updateSessionCache(queryClient, session);
      }),
      api.sockets.chatSessions.onSessionDeleted((sessionId) => {
        removeSessionFromCache(queryClient, sessionId);
      }),
      api.sockets.chatSessions.onMessageCreated((message) => {
        updateMessageCache(queryClient, message);
      }),
      api.sockets.chatSessions.onMessageUpdated((message) => {
        updateMessageCache(queryClient, message);
      }),
    ];

    const unsubscribePartial =
      api.sockets.chatMessages?.onMessagePartial?.((message) => {
        updateMessageCache(queryClient, message);
      });

    if (unsubscribePartial) {
      unsubscribes.push(unsubscribePartial);
    }

    const unsubscribeReasoningPartial =
      api.sockets.chatMessages?.onReasoningPartial?.((payload) => {
        applyReasoningPartial(queryClient, payload);
      });

    if (unsubscribeReasoningPartial) {
      unsubscribes.push(unsubscribeReasoningPartial);
    }

    const unsubscribeReasoningComplete =
      api.sockets.chatMessages?.onReasoningComplete?.((payload) => {
        clearReasoningState(queryClient, payload);
      });

    if (unsubscribeReasoningComplete) {
      unsubscribes.push(unsubscribeReasoningComplete);
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, queryClient]);
}
