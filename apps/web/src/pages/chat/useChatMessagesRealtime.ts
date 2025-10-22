import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ApiClient,
  ChatMessageDto,
  ChatMessageReasoningCompletePayload,
  ChatMessageReasoningPartialPayload,
  ChatSessionDto,
} from "@eddie/api-client";
import { sortSessions, upsertMessage } from "@eddie/ui";

type MessageReasoningSegment = {
  text: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  agentId: string | null;
};

type MessageReasoningState = {
  segments: MessageReasoningSegment[];
  responseId?: string;
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

    if (updated === current) {
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

function getLastReasoningSegment(
  segments: MessageReasoningSegment[]
): MessageReasoningSegment | null {
  if (segments.length === 0) {
    return null;
  }

  return segments[segments.length - 1] ?? null;
}

function appendReasoningSegment(
  segments: MessageReasoningSegment[],
  segment: MessageReasoningSegment
): MessageReasoningSegment[] {
  return [...segments, segment];
}

function updateLastReasoningSegment(
  segments: MessageReasoningSegment[],
  updates: Partial<MessageReasoningSegment>
): MessageReasoningSegment[] {
  const last = getLastReasoningSegment(segments);
  if (!last) {
    return segments;
  }

  const next = {
    ...last,
    ...updates,
  } satisfies MessageReasoningSegment;

  if (
    next === last ||
    (next.text === last.text &&
      next.metadata === last.metadata &&
      next.timestamp === last.timestamp &&
      next.agentId === last.agentId)
  ) {
    return segments;
  }

  const copy = segments.slice();
  copy[copy.length - 1] = next;
  return copy;
}

function mergePartialReasoning(
  current: MessageReasoningState | null,
  payload: ChatMessageReasoningPartialPayload
): MessageReasoningState {
  const segments = current?.segments ?? [];
  const last = getLastReasoningSegment(segments);
  const previousAgentId = last?.agentId ?? null;
  const agentId = resolveAgentId(previousAgentId, payload.agentId);

  const responseId = current?.responseId;
  const normalizedText =
    typeof payload.text === "string" ? payload.text : "";
  const trimmed = normalizedText.trim();

  if (trimmed.length === 0) {
    if (!last) {
      return {
        segments,
        responseId,
        status: "streaming",
      };
    }

    const nextSegments = updateLastReasoningSegment(segments, {
      metadata: payload.metadata ?? last.metadata,
      timestamp: payload.timestamp ?? last.timestamp,
      agentId,
    });

    return {
      segments: nextSegments,
      responseId,
      status: "streaming",
    };
  }

  const segment: MessageReasoningSegment = {
    text: normalizedText,
    metadata: payload.metadata,
    timestamp: payload.timestamp,
    agentId,
  };

  return {
    segments: appendReasoningSegment(segments, segment),
    responseId,
    status: "streaming",
  };
}

function mergeCompletedReasoning(
  current: MessageReasoningState | null,
  payload: ChatMessageReasoningCompletePayload
): MessageReasoningState {
  const segments = current?.segments ?? [];
  const last = getLastReasoningSegment(segments);
  const previousAgentId = last?.agentId ?? null;
  const agentId = resolveAgentId(previousAgentId, payload.agentId);

  let nextSegments = segments;
  const hasText = typeof payload.text === "string";
  const normalizedText = hasText ? payload.text : "";
  const trimmed = normalizedText.trim();
  const hasRenderableText = hasText && trimmed.length > 0;

  if (hasText && !hasRenderableText) {
    if (last) {
      nextSegments = updateLastReasoningSegment(segments, {
        metadata: payload.metadata ?? last.metadata,
        timestamp: payload.timestamp ?? last.timestamp,
        agentId,
      });
    }
  } else if (hasRenderableText) {
    const segment: MessageReasoningSegment = {
      text: normalizedText,
      metadata: payload.metadata,
      timestamp: payload.timestamp,
      agentId,
    };
    nextSegments = appendReasoningSegment(segments, segment);
  } else if (
    payload.metadata ||
    payload.timestamp ||
    payload.agentId !== undefined
  ) {
    nextSegments = updateLastReasoningSegment(segments, {
      metadata: payload.metadata ?? last?.metadata,
      timestamp: payload.timestamp ?? last?.timestamp,
      agentId,
    });
  }

  return {
    segments: nextSegments,
    responseId: payload.responseId ?? current?.responseId,
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
