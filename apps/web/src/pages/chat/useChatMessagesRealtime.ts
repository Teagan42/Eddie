import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { ApiClient, ChatMessageDto, ChatSessionDto } from "@eddie/api-client";
import { sortSessions, upsertMessage } from "./chat-utils";

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

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, queryClient]);
}
