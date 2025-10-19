import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ApiClient,
  ChatMessageDto,
  ChatMessageReasoningCompletePayload,
  ChatMessageReasoningPartialPayload,
  ChatSessionDto,
} from "@eddie/api-client";
import { sortSessions, upsertMessage } from "./chat-utils";

type MessageReasoningState = {
  text: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  responseId?: string;
  agentId: string | null;
  status: "streaming" | "completed";
};

type MessageWithReasoning = ChatMessageDto & {
  reasoning?: MessageReasoningState | null;
};

function updateMessageCache(queryClient: QueryClient, message: ChatMessageDto): void {
  queryClient.setQueryData<ChatMessageDto[] | undefined>(
    ["chat-session", message.sessionId, "messages"],
    (previous = []) => upsertMessage(previous, message)
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

type ReasoningUpdater = (
  current: MessageReasoningState | null
) => MessageReasoningState | null;

function resolveAgentId(
  current: string | null | undefined,
  incoming: string | null | undefined
): string | null {
  if (incoming === undefined) {
    return current ?? null;
  }

  return incoming ?? null;
}

function applyReasoningUpdate(
  messages: ChatMessageDto[],
  messageId: string,
  updater: ReasoningUpdater
): ChatMessageDto[] {
  let changed = false;

  const next = messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    const current = (message as MessageWithReasoning).reasoning ?? null;
    const updated = updater(current);

    if (
      updated === current ||
      (updated &&
        current &&
        updated.text === current.text &&
        updated.status === current.status &&
        updated.metadata === current.metadata &&
        updated.timestamp === current.timestamp &&
        updated.responseId === current.responseId &&
        updated.agentId === current.agentId)
    ) {
      return message;
    }

    changed = true;
    return {
      ...message,
      reasoning: updated,
    } as MessageWithReasoning;
  });

  return changed ? next : messages;
}

function updateReasoningCache(
  queryClient: QueryClient,
  sessionId: string,
  messageId: string,
  updater: ReasoningUpdater
): void {
  const apply = (
    previous: ChatMessageDto[] | undefined
  ): ChatMessageDto[] | undefined => {
    if (!previous) {
      return previous;
    }

    return applyReasoningUpdate(previous, messageId, updater);
  };

  queryClient.setQueryData<ChatMessageDto[] | undefined>(
    ["chat-session", sessionId, "messages"],
    apply
  );
  queryClient.setQueryData<ChatMessageDto[] | undefined>(
    ["chat-sessions", sessionId, "messages"],
    apply
  );
}

function mergePartialReasoning(
  current: MessageReasoningState | null,
  payload: ChatMessageReasoningPartialPayload
): MessageReasoningState {
  const agentId = resolveAgentId(current?.agentId, payload.agentId);

  return {
    text: payload.text,
    metadata: payload.metadata ?? current?.metadata,
    timestamp: payload.timestamp ?? current?.timestamp,
    responseId: current?.responseId,
    agentId,
    status: "streaming",
  };
}

function mergeCompletedReasoning(
  current: MessageReasoningState | null,
  payload: ChatMessageReasoningCompletePayload
): MessageReasoningState {
  const agentId = resolveAgentId(current?.agentId, payload.agentId);

  return {
    text: payload.text ?? current?.text ?? "",
    metadata: payload.metadata ?? current?.metadata,
    timestamp: payload.timestamp ?? current?.timestamp,
    responseId: payload.responseId ?? current?.responseId,
    agentId,
    status: "completed",
  };
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

    const unsubscribeReasoningPartial =
      api.sockets.chatMessages?.onReasoningPartial?.((payload) => {
        if (!payload?.sessionId || !payload.messageId) {
          return;
        }

        updateReasoningCache(
          queryClient,
          payload.sessionId,
          payload.messageId,
          (current) => mergePartialReasoning(current, payload)
        );
      });

    const unsubscribeReasoningComplete =
      api.sockets.chatMessages?.onReasoningComplete?.((payload) => {
        if (!payload?.sessionId || !payload.messageId) {
          return;
        }

        updateReasoningCache(
          queryClient,
          payload.sessionId,
          payload.messageId,
          (current) => mergeCompletedReasoning(current, payload)
        );
      });

    if (unsubscribePartial) {
      unsubscribes.push(unsubscribePartial);
    }

    if (unsubscribeReasoningPartial) {
      unsubscribes.push(unsubscribeReasoningPartial);
    }

    if (unsubscribeReasoningComplete) {
      unsubscribes.push(unsubscribeReasoningComplete);
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, queryClient]);
}
