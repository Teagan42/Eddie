import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient, LogEntryDto } from "@eddie/api-client";

interface UseChatSessionEventsOptions {
  api: ApiClient;
  queryClient: QueryClient;
  mergeLogsIntoCache: (incoming: LogEntryDto | LogEntryDto[]) => void;
  selectedSessionId: string | null;
}

export function useChatSessionEvents({
  api,
  queryClient,
  mergeLogsIntoCache,
  selectedSessionId,
}: UseChatSessionEventsOptions): void {
  useEffect(() => {
    const subscriptions = [
      api.sockets.chatSessions.onSessionCreated(() =>
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] })
      ),
      api.sockets.chatSessions.onSessionUpdated((session) => {
        queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
        if (session.id === selectedSessionId) {
          queryClient.invalidateQueries({
            queryKey: ["chat-sessions", session.id, "messages"],
          });
        }
      }),
      api.sockets.chatSessions.onMessageCreated((message) =>
        queryClient.invalidateQueries({
          queryKey: ["chat-sessions", message.sessionId, "messages"],
        })
      ),
      api.sockets.chatSessions.onMessageUpdated((message) =>
        queryClient.invalidateQueries({
          queryKey: ["chat-sessions", message.sessionId, "messages"],
        })
      ),
      api.sockets.traces.onTraceCreated(() => queryClient.invalidateQueries({ queryKey: ["traces"] })),
      api.sockets.traces.onTraceUpdated(() => queryClient.invalidateQueries({ queryKey: ["traces"] })),
      api.sockets.logs.onLogCreated((entry) => mergeLogsIntoCache(entry)),
      api.sockets.config.onConfigUpdated(() => queryClient.invalidateQueries({ queryKey: ["config"] })),
    ];

    return () => {
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, mergeLogsIntoCache, queryClient, selectedSessionId]);
}
