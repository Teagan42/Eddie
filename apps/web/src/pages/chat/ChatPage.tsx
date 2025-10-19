import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Box, Button, Flex, Heading, ScrollArea, Select, Text, TextField } from '@radix-ui/themes';
import {
  ChatBubbleIcon,
  MagicWandIcon,
  PlusIcon,
} from '@radix-ui/react-icons';
import { type AgentActivityState } from './AgentActivityIndicator';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChatMessageDto,
  ChatSessionDto,
  CreateChatMessageDto,
  CreateChatSessionDto,
  ProviderCatalogEntryDto,
} from '@eddie/api-client';
import { useApi } from '@/api/api-provider';
import { useAuth } from '@/auth/auth-context';
import { useLayoutPreferences } from '@/hooks/useLayoutPreferences';
import type { LayoutPreferencesDto } from '@eddie/api-client';
import { Panel } from "@/components/common";
import { Sheet, SheetTrigger } from "@/vendor/components/ui/sheet";
import { cn } from "@/vendor/lib/utils";
import { toast } from '@/vendor/hooks/use-toast';
import { getSurfaceLayoutClasses, SURFACE_CONTENT_CLASS } from '@/styles/surfaces';
import { sortSessions, upsertMessage } from './chat-utils';
import {
  ChatWindow,
  ContextBundlesPanel,
  AgentToolsDrawer,
  SessionSelector,
  type ChatWindowComposerRole,
  type SessionSelectorMetricsSummary,
  type SessionSelectorSession,
} from './components';
import { useChatMessagesRealtime } from './useChatMessagesRealtime';
import {
  applyToolCallEvent,
  applyToolResultEvent,
  cloneExecutionTreeState,
  coerceExecutionTreeState,
  composeExecutionTreeState,
  createEmptyExecutionTreeState,
  createExecutionTreeStateFromMetadata,
  type ExecutionTreeState,
  type ToolEventPayload,
} from './execution-tree-state';

const ORCHESTRATOR_METADATA_QUERY_KEY = 'orchestrator-metadata' as const;

const getOrchestratorMetadataQueryKey = (sessionId: string | null) =>
  [ORCHESTRATOR_METADATA_QUERY_KEY, sessionId] as const;

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Please try again.';
}

const PANEL_IDS = {
  context: 'context-bundles',
} as const;

const SCROLL_VIEWPORT_SELECTOR = '[data-radix-scroll-area-viewport]';

const CHAT_SESSIONS_QUERY_KEY = ['chat-sessions'] as const;

const scrollMessageViewportToBottom = (anchor: HTMLElement): void => {
  const viewport = anchor.closest(SCROLL_VIEWPORT_SELECTOR);
  if (viewport instanceof HTMLElement) {
    const target = viewport.scrollHeight;
    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ top: target });
    } else {
      viewport.scrollTop = target;
    }
    return;
  }

  anchor.scrollIntoView({ block: 'end' });
};

type ChatPreferences = NonNullable<LayoutPreferencesDto['chat']>;

type ComposerRole = ChatWindowComposerRole;

const DEFAULT_COMPOSER_ROLE: ComposerRole = 'user';

type AutoSessionAttemptStatus = 'idle' | 'pending' | 'failed';

type AutoSessionAttemptState = {
  status: AutoSessionAttemptStatus;
  apiKey: string | null;
  lastAttemptAt: number | null;
  lastFailureAt: number | null;
};

type SessionContextSnapshot = {
  sessionId: string;
  executionTree: ExecutionTreeState;
  capturedAt?: string;
};

type PartialExecutionTreeMetadata = {
  executionTree?: ExecutionTreeState | null;
  agentHierarchy?: ExecutionTreeState['agentHierarchy'];
  toolInvocations?: ExecutionTreeState['toolInvocations'];
  contextBundles?: ExecutionTreeState['contextBundles'];
};

function deriveExecutionTreeFromSnapshotLike(value: unknown): ExecutionTreeState | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as PartialExecutionTreeMetadata;
  if (candidate.executionTree) {
    return candidate.executionTree;
  }

  const agentHierarchy = Array.isArray(candidate.agentHierarchy)
    ? candidate.agentHierarchy
    : [];
  const toolInvocations = Array.isArray(candidate.toolInvocations)
    ? candidate.toolInvocations
    : [];
  const contextBundles = Array.isArray(candidate.contextBundles)
    ? candidate.contextBundles
    : [];

  if (agentHierarchy.length === 0 && toolInvocations.length === 0 && contextBundles.length === 0) {
    return null;
  }

  return composeExecutionTreeState(agentHierarchy, toolInvocations, contextBundles);
}

function cloneSessionContext(
  snapshot: SessionContextSnapshot | null | undefined,
): SessionContextSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    sessionId: snapshot.sessionId,
    capturedAt: snapshot.capturedAt,
    executionTree: cloneExecutionTreeState(snapshot.executionTree),
  };
}

function removeSessionKey<T extends Record<string, unknown>>(
  record: T,
  sessionId: string,
): T {
  if (!(sessionId in record)) {
    return record;
  }

  const next = { ...record } as T;
  delete next[sessionId];
  return next;
}

const STREAM_ACTIVITY_STATES = new Set<Exclude<AgentActivityState, 'sending'>>([
  'idle',
  'thinking',
  'tool',
  'tool-error',
  'error',
]);

function isStreamActivityState(value: AgentActivityState): value is Exclude<AgentActivityState, 'sending'> {
  return STREAM_ACTIVITY_STATES.has(value as Exclude<AgentActivityState, 'sending'>);
}

export function ChatPage(): JSX.Element {
  const api = useApi();
  const { apiKey } = useAuth();
  const queryClient = useQueryClient();
  const { preferences, updatePreferences } = useLayoutPreferences();
  useChatMessagesRealtime(api);
  const [composerValue, setComposerValue] = useState('');
  // Derive a safe default for composer role from the DTO union (fall back to 'user')
  const [composerRole, setComposerRole] = useState<ComposerRole>(DEFAULT_COMPOSER_ROLE);
  const [agentStreamActivity, setAgentStreamActivity] = useState<
    Exclude<AgentActivityState, 'sending'>
  >('idle');

  const sessionsQuery = useQuery({
    queryKey: CHAT_SESSIONS_QUERY_KEY,
    queryFn: () => api.http.chatSessions.list(),
  });

  const sessions = useMemo(() => sortSessions(sessionsQuery.data ?? []), [sessionsQuery.data]);
  const sessionsLoaded = sessionsQuery.isSuccess;

  const selectedSessionIdRef = useRef<string | null>(null);
  const [autoSessionAttempt, setAutoSessionAttempt] = useState<AutoSessionAttemptState>({
    status: 'idle',
    apiKey: null,
    lastAttemptAt: null,
    lastFailureAt: null,
  });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isAgentToolsOpen, setAgentToolsOpen] = useState(false);
  const [focusedToolInvocationId, setFocusedToolInvocationId] = useState<string | null>(null);
  const setAutoSessionAttemptState = useCallback(
    (updates: Partial<AutoSessionAttemptState>) => {
      setAutoSessionAttempt((previous) => ({ ...previous, ...updates }));
    },
    [],
  );
  const resetAutoSessionAttempt = useCallback(() => {
    setAutoSessionAttemptState({ status: 'idle', lastAttemptAt: null, lastFailureAt: null });
  }, [setAutoSessionAttemptState]);
  const agentActivitySessionRef = useRef<string | null>(null);
  const sessionContextByIdRef = useRef<Record<string, SessionContextSnapshot>>({});
  const [sessionContextById, setSessionContextById] = useState<
    Record<string, SessionContextSnapshot>
  >({});
  const [messageCountBySession, setMessageCountBySession] = useState<Record<string, number>>({});

  const syncSessionContextCache = useCallback(
    (sessionId: string, snapshot: SessionContextSnapshot | null) => {
      queryClient.setQueryData<SessionContextSnapshot | null>(
        getOrchestratorMetadataQueryKey(sessionId),
        snapshot,
      );
    },
    [queryClient],
  );

  const setSessionContext = useCallback(
    (
      sessionId: string,
      snapshot: SessionContextSnapshot | null,
      options?: { syncQueryCache?: boolean },
    ): SessionContextSnapshot | null => {
      const { syncQueryCache = true } = options ?? {};

      if (!snapshot) {
        setSessionContextById((previous) => removeSessionKey(previous, sessionId));
        if (syncQueryCache) {
          syncSessionContextCache(sessionId, null);
        }
        return null;
      }

      const cloned = cloneSessionContext(snapshot);
      setSessionContextById((previous) => ({ ...previous, [sessionId]: cloned }));
      if (syncQueryCache) {
        syncSessionContextCache(sessionId, cloned);
      }
      return cloned;
    },
    [syncSessionContextCache],
  );

  useEffect(() => {
    sessionContextByIdRef.current = sessionContextById;
  }, [sessionContextById]);

  const handleToolLifecycleEvent = useCallback(
    (type: 'call' | 'result', payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const event = payload as ToolEventPayload;
      const sessionId = typeof event.sessionId === 'string' ? event.sessionId : null;
      if (!sessionId) {
        return;
      }

      const existing = sessionContextByIdRef.current[sessionId];
      const clonedExisting = existing ? cloneSessionContext(existing) : null;
      const snapshot: SessionContextSnapshot = clonedExisting ?? {
        sessionId,
        executionTree: createEmptyExecutionTreeState(),
        capturedAt: undefined,
      };

      const nextTree =
        type === 'call'
          ? applyToolCallEvent(snapshot.executionTree, event)
          : applyToolResultEvent(snapshot.executionTree, event);

      setSessionContext(sessionId, {
        sessionId: snapshot.sessionId,
        capturedAt: snapshot.capturedAt,
        executionTree: nextTree,
      });
    },
    [setSessionContext],
  );

  useEffect(() => {
    const tools = api.sockets.tools;
    if (!tools) {
      return;
    }

    const unsubscribes = [
      tools.onToolCall((payload) => handleToolLifecycleEvent('call', payload)),
      tools.onToolResult((payload) => handleToolLifecycleEvent('result', payload)),
    ];

    return () => {
      unsubscribes.forEach((unsubscribe) => {
        try {
          unsubscribe?.();
        } catch {
          // Swallow teardown errors to keep realtime resilient.
        }
      });
    };
  }, [api, handleToolLifecycleEvent]);

  useEffect(() => {
    const chatSessions = api.sockets.chatSessions;
    const subscribe = chatSessions?.onExecutionTreeUpdated;

    if (!subscribe) {
      return;
    }

    const persistExecutionState = (
      sessionId: string,
      tree: ExecutionTreeState,
      timestamp?: string,
    ): void => {
      setSessionContext(sessionId, {
        sessionId,
        executionTree: cloneExecutionTreeState(tree),
        capturedAt: timestamp ?? undefined,
      });
    };

    const unsubscribe = subscribe((payload) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const { sessionId, state } = payload as {
        sessionId?: string | null;
        state?: ExecutionTreeState | null;
      };

      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        return;
      }

      if (selectedSessionIdRef.current !== sessionId) {
        return;
      }

      const normalizedState = coerceExecutionTreeState(state);
      if (!normalizedState) {
        return;
      }

      const existingSnapshot = sessionContextByIdRef.current[sessionId];
      const existingTree = existingSnapshot?.executionTree;

      let mergedTree = normalizedState;

      if (existingTree) {
        const shouldMergeToolInvocations = normalizedState.toolInvocations.length === 0;
        const shouldMergeContextBundles = normalizedState.contextBundles.length === 0;

        if (shouldMergeToolInvocations || shouldMergeContextBundles) {
          const nextToolInvocations = shouldMergeToolInvocations
            ? existingTree.toolInvocations
            : normalizedState.toolInvocations;
          const nextContextBundles = shouldMergeContextBundles
            ? existingTree.contextBundles
            : normalizedState.contextBundles;

          mergedTree = composeExecutionTreeState(
            normalizedState.agentHierarchy,
            nextToolInvocations,
            nextContextBundles,
            {
              createdAt: normalizedState.createdAt,
              updatedAt: normalizedState.updatedAt,
            },
          );
        }
      }

      persistExecutionState(sessionId, mergedTree, normalizedState.updatedAt);
    });

    const fetchExecutionState = async (): Promise<void> => {
      const targetSessionId = selectedSessionIdRef.current;
      if (!targetSessionId) {
        return;
      }

      try {
        const state = await api.http.orchestrator.getExecutionState(targetSessionId);
        const normalized = coerceExecutionTreeState(state);
        if (!normalized) {
          return;
        }

        const existingSnapshot = sessionContextByIdRef.current[targetSessionId];
        const existingCapturedAt = existingSnapshot?.capturedAt;
        const fetchedCapturedAt = normalized.updatedAt ?? undefined;

        if (existingCapturedAt) {
          if (!fetchedCapturedAt) {
            return;
          }

          const existingTimestamp = Date.parse(existingCapturedAt);
          const fetchedTimestamp = Date.parse(fetchedCapturedAt);

          if (
            Number.isFinite(existingTimestamp) &&
            Number.isFinite(fetchedTimestamp) &&
            fetchedTimestamp < existingTimestamp
          ) {
            return;
          }
        }

        persistExecutionState(
          targetSessionId,
          normalized,
          normalized.updatedAt ?? undefined,
        );
      } catch (error) {
        const status = (error as { status?: number; }).status;
        if (status === 404) {
          return;
        }
      }
    };

    void fetchExecutionState();

    return () => {
      try {
        unsubscribe?.();
      } catch {
        // Ignore teardown errors to keep realtime updates resilient.
      }
    };
  }, [api, setSessionContext]);

  const getMessageCacheLength = useCallback(
    (sessionId: string): number | undefined => {
      const directMessages = queryClient.getQueryData<ChatMessageDto[]>([
        'chat-session',
        sessionId,
        'messages',
      ]);
      if (Array.isArray(directMessages)) {
        return directMessages.length;
      }

      const overviewMessages = queryClient.getQueryData<ChatMessageDto[]>([
        'chat-sessions',
        sessionId,
        'messages',
      ]);
      if (Array.isArray(overviewMessages)) {
        return overviewMessages.length;
      }

      return undefined;
    },
    [queryClient],
  );

  const synchronizeMessageCount = useCallback(
    (sessionId: string) => {
      setMessageCountBySession((previous) => {
        const nextCount = getMessageCacheLength(sessionId);

        if (typeof nextCount !== 'number') {
          if (sessionId in previous) {
            return removeSessionKey(previous, sessionId);
          }
          return previous;
        }

        if (previous[sessionId] === nextCount) {
          return previous;
        }

        return { ...previous, [sessionId]: nextCount };
      });
    },
    [getMessageCacheLength],
  );

  const resolveMessageCount = useCallback(
    (sessionId: string): number | undefined => {
      const cached = messageCountBySession[sessionId];
      if (typeof cached === 'number') {
        return cached;
      }

      return getMessageCacheLength(sessionId);
    },
    [getMessageCacheLength, messageCountBySession],
  );

  useEffect(() => {
    sessions.forEach((session) => {
      synchronizeMessageCount(session.id);
    });
  }, [sessions, synchronizeMessageCount]);

  const getSessionContextBundles = useCallback(
    (sessionId: string | null): ExecutionTreeState['contextBundles'] => {
      if (!sessionId) {
        return [];
      }

      return sessionContextById[sessionId]?.executionTree.contextBundles ?? [];
    },
    [sessionContextById],
  );

  const sessionsWithMetrics = useMemo<SessionSelectorSession[]>(() => {
    return sessions.map((session) => {
      const metrics: SessionSelectorMetricsSummary = {};
      const messageCount = resolveMessageCount(session.id);
      if (typeof messageCount === 'number') {
        metrics.messageCount = messageCount;
      }

      const contextBundles = getSessionContextBundles(session.id);
      if (contextBundles.length > 0) {
        metrics.contextBundleCount = contextBundles.length;
      }

      const hasMetrics =
        metrics.messageCount != null ||
        metrics.contextBundleCount != null;

      return hasMetrics ? { ...session, metrics } : session;
    });
  }, [getSessionContextBundles, resolveMessageCount, sessions]);

  const invalidateSessionContext = useCallback(
    (sessionId?: string) => {
      const targetSessionId = sessionId ?? selectedSessionIdRef.current;

      if (!targetSessionId) {
        return;
      }

      queryClient.invalidateQueries({
        queryKey: getOrchestratorMetadataQueryKey(targetSessionId),
      });
    },
    [queryClient],
  );

  const applyChatUpdate = useCallback(
    (updater: (current: ChatPreferences) => ChatPreferences | void) => {
      updatePreferences((previous: LayoutPreferencesDto) => {
        const base: ChatPreferences = {
          selectedSessionId: previous.chat?.selectedSessionId,
          collapsedPanels: { ...(previous.chat?.collapsedPanels ?? {}) },
          sessionSettings: { ...(previous.chat?.sessionSettings ?? {}) },
          templates: { ...(previous.chat?.templates ?? {}) },
        };
        const result = updater(base);
        const nextChat = result ?? base;
        return {
          ...previous,
          chat: nextChat,
          updatedAt: new Date().toISOString(),
        };
      });
    },
    [updatePreferences],
  );

  const setSelectedSessionPreference = useCallback(
    (nextSessionId: string | null) => {
      const normalized = nextSessionId ?? null;
      selectedSessionIdRef.current = normalized;
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: normalized }));
    },
    [applyChatUpdate],
  );

  const selectedSessionId = useMemo(() => {
    if (preferences.chat?.selectedSessionId) {
      return preferences.chat.selectedSessionId;
    }
    return sessions[0]?.id ?? null;
  }, [preferences.chat?.selectedSessionId, sessions]);

  selectedSessionIdRef.current = selectedSessionId ?? null;

  const selectedSessionSnapshot = selectedSessionId
    ? sessionContextById[selectedSessionId] ?? null
    : null;
  const executionTreeState = useMemo(
    () => selectedSessionSnapshot?.executionTree ?? null,
    [selectedSessionSnapshot],
  );

  useEffect(() => {
    if (!preferences.chat?.selectedSessionId && sessions[0]?.id) {
      setSelectedSessionPreference(sessions[0]!.id);
    }
  }, [preferences.chat?.selectedSessionId, sessions, setSelectedSessionPreference]);

  useEffect(() => {
    setComposerValue('');
    setComposerRole(DEFAULT_COMPOSER_ROLE);
    setSelectedAgentId(null);
  }, [selectedSessionId]);

  const messagesQuery = useQuery({
    queryKey: ['chat-session', selectedSessionId, 'messages'],
    enabled: Boolean(selectedSessionId),
    queryFn: () =>
      selectedSessionId
        ? api.http.chatSessions.listMessages(selectedSessionId)
        : Promise.resolve([]),
  });

  useEffect(() => {
    if (!selectedSessionId) {
      return;
    }
    if (!Array.isArray(messagesQuery.data)) {
      return;
    }

    synchronizeMessageCount(selectedSessionId);
  }, [messagesQuery.data, selectedSessionId, synchronizeMessageCount]);

  useEffect(() => {
    const normalizedSessionId = selectedSessionId ?? null;
    if (agentActivitySessionRef.current !== normalizedSessionId) {
      agentActivitySessionRef.current = normalizedSessionId;
      setAgentStreamActivity('idle');
    }

    const unsubscribe = api.sockets.chatSessions.onAgentActivity((activity) => {
      if (!activity || activity.sessionId !== selectedSessionId) {
        return;
      }

      if (isStreamActivityState(activity.state)) {
        setAgentStreamActivity(activity.state);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [api, selectedSessionId]);

  useEffect(() => {
    const unsubscribes = [
      api.sockets.chatSessions.onSessionCreated((session) => {
        queryClient.setQueryData<ChatSessionDto[]>(CHAT_SESSIONS_QUERY_KEY, (previous = []) =>
          mergeSessionList(previous, session),
        );
      }),
      api.sockets.chatSessions.onSessionUpdated((session) => {
        queryClient.setQueryData<ChatSessionDto[]>(CHAT_SESSIONS_QUERY_KEY, (previous = []) =>
          mergeSessionList(previous, session),
        );
      }),
      api.sockets.chatSessions.onSessionDeleted((sessionId) => {
        queryClient.setQueryData<ChatSessionDto[]>(CHAT_SESSIONS_QUERY_KEY, (previous = []) =>
          previous.filter((item) => item.id !== sessionId),
        );
        queryClient.removeQueries({ queryKey: ['chat-session', sessionId, 'messages'] });
        queryClient.removeQueries({ queryKey: ['chat-sessions', sessionId, 'messages'] });
        if (selectedSessionIdRef.current === sessionId) {
          setSelectedSessionPreference(null);
        }
        setSessionContext(sessionId, null);
        setMessageCountBySession((previous) => removeSessionKey(previous, sessionId));
      }),
      api.sockets.chatSessions.onMessageCreated((message) => {
        queryClient.setQueryData<ChatMessageDto[]>(
          ['chat-session', message.sessionId, 'messages'],
          (previous = []) => {
            const next = previous.some((existing) => existing.id === message.id)
              ? previous
              : [...previous, message];
            return next.sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
          },
        );
        synchronizeMessageCount(message.sessionId);
      }),
      api.sockets.chatSessions.onMessageUpdated((message) => {
        queryClient.setQueryData<ChatMessageDto[]>(
          ['chat-session', message.sessionId, 'messages'],
          (previous = []) => {
            const exists = previous.some((existing) => existing.id === message.id);
            const next = exists
              ? previous.map((existing) =>
                existing.id === message.id ? { ...existing, ...message } : existing,
              )
              : [...previous, message];
            return next.sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
          },
        );
        synchronizeMessageCount(message.sessionId);
      }),
    ];

    const traceSockets = api.sockets.traces;
    if (traceSockets) {
      unsubscribes.push(
        traceSockets.onTraceCreated((trace) => {
          invalidateSessionContext(trace.sessionId);
        }),
        traceSockets.onTraceUpdated((trace) => {
          invalidateSessionContext(trace.sessionId);
        }),
      );
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    api,
    invalidateSessionContext,
    synchronizeMessageCount,
    queryClient,
    setSessionContext,
    setSelectedSessionPreference,
  ]);

  const { data: sessionContextQueryData } = useQuery({
    queryKey: getOrchestratorMetadataQueryKey(selectedSessionId),
    enabled: Boolean(selectedSessionId),
    queryFn: async () => {
      if (!selectedSessionId) {
        return null;
      }

      const raw = await api.http.orchestrator.getMetadata(selectedSessionId);
      if (!raw) {
        return null;
      }

      return {
        sessionId: raw.sessionId ?? selectedSessionId,
        executionTree: createExecutionTreeStateFromMetadata(raw),
        capturedAt: raw.capturedAt ?? undefined,
      } satisfies SessionContextSnapshot;
    },
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (sessionContextQueryData === undefined) {
      return;
    }

    const sessionId = sessionContextQueryData?.sessionId ?? selectedSessionId ?? null;
    if (!sessionId) {
      return;
    }

    const existing = sessionContextByIdRef.current[sessionId];
    const incomingTree = deriveExecutionTreeFromSnapshotLike(sessionContextQueryData);

    if (!incomingTree) {
      if (!existing) {
        setSessionContext(sessionId, null, { syncQueryCache: false });
      }
      return;
    }

    let mergedTree = incomingTree;
    if (existing) {
      const { executionTree: existingTree } = existing;
      mergedTree = composeExecutionTreeState(
        incomingTree.agentHierarchy,
        incomingTree.toolInvocations.length > 0
          ? incomingTree.toolInvocations
          : existingTree.toolInvocations,
        incomingTree.contextBundles.length > 0
          ? incomingTree.contextBundles
          : existingTree.contextBundles,
      );
    }

    setSessionContext(
      sessionId,
      { ...sessionContextQueryData, executionTree: mergedTree },
      { syncQueryCache: false },
    );
  }, [
    selectedSessionId,
    sessionContextQueryData,
    setSessionContext,
  ]);

  const renameSessionMutation = useMutation<
    ChatSessionDto,
    unknown,
    { sessionId: string; title: string },
    { previousSessions: ChatSessionDto[] }
  >({
    mutationFn: ({ sessionId, title }) =>
      api.http.chatSessions.rename(sessionId, { title }),
    onMutate: async ({ sessionId, title }) => {
      await queryClient.cancelQueries({ queryKey: CHAT_SESSIONS_QUERY_KEY });
      const previousSessions =
        queryClient.getQueryData<ChatSessionDto[]>(CHAT_SESSIONS_QUERY_KEY) ?? [];
      const nextTitle = title.trim();
      if (nextTitle) {
        queryClient.setQueryData<ChatSessionDto[]>(
          CHAT_SESSIONS_QUERY_KEY,
          previousSessions.map((session) =>
            session.id === sessionId ? { ...session, title: nextTitle } : session,
          ),
        );
      }
      return { previousSessions };
    },
    onSuccess: (session) => {
      queryClient.setQueryData<ChatSessionDto[]>(CHAT_SESSIONS_QUERY_KEY, (previous = []) =>
        mergeSessionList(previous, session),
      );
      toast({
        title: 'Session renamed',
        description: `Renamed to "${session.title}"`,
        variant: 'success',
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousSessions) {
        queryClient.setQueryData(CHAT_SESSIONS_QUERY_KEY, context.previousSessions);
      }
      toast({
        title: 'Failed to rename session',
        description: resolveErrorMessage(error),
        variant: 'error',
      });
    },
  });

  const deleteSessionMutation = useMutation<
    void,
    unknown,
    string,
    { previousSessions: ChatSessionDto[]; previousSelected: string | null }
  >({
    mutationFn: (sessionId) => api.http.chatSessions.delete(sessionId),
    onMutate: async (sessionId) => {
      await queryClient.cancelQueries({ queryKey: CHAT_SESSIONS_QUERY_KEY });
      const previousSessions =
        queryClient.getQueryData<ChatSessionDto[]>(CHAT_SESSIONS_QUERY_KEY) ?? [];
      queryClient.setQueryData<ChatSessionDto[]>(
        CHAT_SESSIONS_QUERY_KEY,
        previousSessions.filter((session) => session.id !== sessionId),
      );
      return {
        previousSessions,
        previousSelected: selectedSessionIdRef.current ?? null,
      };
    },
    onSuccess: async (_result, sessionId) => {
      const messagesQueryKey = ['chat-session', sessionId, 'messages'] as const;
      const overviewMessagesQueryKey = ['chat-sessions', sessionId, 'messages'] as const;
      const orchestratorQueryKey = getOrchestratorMetadataQueryKey(sessionId);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: messagesQueryKey, exact: true }),
        queryClient.cancelQueries({ queryKey: overviewMessagesQueryKey, exact: true }),
        queryClient.cancelQueries({ queryKey: orchestratorQueryKey, exact: true }),
      ]);

      queryClient.setQueryData<ChatMessageDto[]>(messagesQueryKey, []);
      queryClient.setQueryData<ChatMessageDto[]>(overviewMessagesQueryKey, []);
      setSessionContext(sessionId, null);
      setMessageCountBySession((previous) => removeSessionKey(previous, sessionId));
      const remainingSessions =
        queryClient.getQueryData<ChatSessionDto[]>(CHAT_SESSIONS_QUERY_KEY) ?? [];
      if (selectedSessionIdRef.current === sessionId) {
        setSelectedSessionPreference(remainingSessions[0]?.id ?? null);
      }
      toast({
        title: 'Session deleted',
        description: 'The session was removed.',
        variant: 'success',
      });
    },
    onError: (error, _sessionId, context) => {
      if (context?.previousSessions) {
        queryClient.setQueryData(CHAT_SESSIONS_QUERY_KEY, context.previousSessions);
      }
      if (context?.previousSelected !== undefined) {
        setSelectedSessionPreference(context.previousSelected);
      }
      toast({
        title: 'Failed to delete session',
        description: resolveErrorMessage(error),
        variant: 'error',
      });
    },
  });

  const { mutate: runRenameSession, isPending: isRenamingSession } = renameSessionMutation;
  const { mutate: runDeleteSession, isPending: isDeletingSession } = deleteSessionMutation;

  const createSessionMutation = useMutation({
    mutationFn: (payload: CreateChatSessionDto) => api.http.chatSessions.create(payload),
    onSuccess: (session) => {
      resetAutoSessionAttempt();
      queryClient.setQueryData<ChatSessionDto[]>(CHAT_SESSIONS_QUERY_KEY, (previous = []) =>
        mergeSessionList(previous, session),
      );
      setSelectedSessionPreference(session.id);
    },
    onError: () => {
      setAutoSessionAttemptState({ status: 'failed', lastFailureAt: Date.now() });
    },
  });
  const { mutate: runCreateSession } = createSessionMutation;
  const isCreatingSession = createSessionMutation.isPending;

  useEffect(() => {
    const currentKey = apiKey ?? null;
    if (autoSessionAttempt.apiKey !== currentKey) {
      setAutoSessionAttemptState({
        apiKey: currentKey,
        status: 'idle',
        lastAttemptAt: null,
        lastFailureAt: null,
      });
    }
  }, [apiKey, autoSessionAttempt.apiKey, setAutoSessionAttemptState]);

  useEffect(() => {
    if (sessions.length > 0) {
      resetAutoSessionAttempt();
    }
  }, [resetAutoSessionAttempt, sessions.length]);

  useEffect(() => {
    if (!apiKey || !sessionsLoaded || sessions.length > 0) {
      return;
    }

    if (autoSessionAttempt.status === 'failed') {
      return;
    }

    if (autoSessionAttempt.status !== 'idle' || isCreatingSession) {
      return;
    }

    const now = Date.now();
    if (autoSessionAttempt.lastAttemptAt && now - autoSessionAttempt.lastAttemptAt < 5_000) {
      return;
    }

    setAutoSessionAttemptState({
      status: 'pending',
      apiKey: apiKey ?? null,
      lastAttemptAt: now,
      lastFailureAt: null,
    });
    runCreateSession({
      title: 'New orchestrator session',
      description: '',
    });
  }, [
    apiKey,
    autoSessionAttempt.lastAttemptAt,
    autoSessionAttempt.lastFailureAt,
    autoSessionAttempt.status,
    runCreateSession,
    isCreatingSession,
    sessions.length,
    sessionsLoaded,
    setAutoSessionAttemptState,
  ]);

  const sendMessageMutation = useMutation({
    mutationFn: (input: { sessionId: string; message: CreateChatMessageDto }) =>
      api.http.chatSessions.createMessage(input.sessionId, input.message),
    onSuccess: (message) => {
      setComposerValue('');
      queryClient.setQueryData<ChatMessageDto[]>(
        ['chat-session', message.sessionId, 'messages'],
        (previous = []) => upsertMessage(previous, message),
      );
    },
  });

  const collapsedPanels = preferences.chat?.collapsedPanels ?? {};
  const sessionSettings = preferences.chat?.sessionSettings ?? {};

  const providerCatalogQuery = useQuery<ProviderCatalogEntryDto[]>({
    queryKey: ['providers', 'catalog'],
    queryFn: () => api.http.providers.catalog(),
    staleTime: 300_000,
  });

  const providerCatalog = useMemo(
    () => providerCatalogQuery.data ?? [],
    [providerCatalogQuery.data],
  );

  const activeSettings = selectedSessionId ? (sessionSettings[selectedSessionId] ?? {}) : {};

  const providerOptions = useMemo(() => {
    const options = providerCatalog.map((entry) => ({
      label: entry.label ?? entry.name,
      value: entry.name,
    }));
    if (
      activeSettings.provider &&
      !options.some((option) => option.value === activeSettings.provider)
    ) {
      options.unshift({
        label: activeSettings.provider,
        value: activeSettings.provider,
      });
    }
    return options;
  }, [activeSettings.provider, providerCatalog]);

  const selectedProvider = activeSettings.provider ?? providerOptions[0]?.value ?? '';


  const messagesWithMetadata = useMemo(() => {
    const baseMessages = messagesQuery.data ?? [];
    return enrichMessagesWithExecutionTree(baseMessages, executionTreeState);
  }, [executionTreeState, messagesQuery.data]);
  const selectedContextBundles = useMemo(
    () => getSessionContextBundles(selectedSessionId ?? null),
    [getSessionContextBundles, selectedSessionId],
  );
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const lastMessage = messagesWithMetadata[messagesWithMetadata.length - 1] ?? null;
  const agentActivityState = useMemo<AgentActivityState>(() => {
    if (sendMessageMutation.isPending) {
      return 'sending';
    }

    if (sendMessageMutation.isError) {
      return 'error';
    }

    return agentStreamActivity;
  }, [agentStreamActivity, sendMessageMutation.isError, sendMessageMutation.isPending]);

  useEffect(() => {
    if (!lastMessage) {
      return;
    }

    const scrollAnchor = scrollAnchorRef.current;
    if (!scrollAnchor) {
      return;
    }

    scrollMessageViewportToBottom(scrollAnchor);
  }, [lastMessage, lastMessage?.content, lastMessage?.id, messagesWithMetadata.length]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === selectedSessionId) {
        return;
      }
      setSelectedSessionPreference(sessionId);
    },
    [selectedSessionId, setSelectedSessionPreference],
  );

  const handleRenameSession = useCallback(
    (sessionId: string) => {
      if (isRenamingSession) {
        return;
      }
      const current = sessions.find((session) => session.id === sessionId);
      const nextTitle = window.prompt('Rename session', current?.title ?? '');
      const trimmed = nextTitle?.trim();
      if (!trimmed || trimmed === current?.title) {
        return;
      }
      runRenameSession({ sessionId, title: trimmed });
    },
    [isRenamingSession, runRenameSession, sessions],
  );
  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      if (isDeletingSession) {
        return;
      }
      if (!window.confirm('Delete this session? This action cannot be undone.')) {
        return;
      }
      runDeleteSession(sessionId);
    },
    [isDeletingSession, runDeleteSession],
  );

  const composerUnavailable = !apiKey || !selectedSessionId;
  const composerSubmitDisabled = composerUnavailable || !composerValue.trim();
  const composerInputDisabled = composerUnavailable || sendMessageMutation.isPending;

  const handleSendMessage = useCallback(() => {
    const trimmed = composerValue.trim();
    if (!apiKey || !selectedSessionId || !trimmed) {
      return;
    }
    sendMessageMutation.mutate({
      sessionId: selectedSessionId,
      message: {
        role: composerRole,
        content: trimmed,
      },
    });
  }, [apiKey, composerRole, composerValue, selectedSessionId, sendMessageMutation]);

  const handleComposerSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      handleSendMessage();
    },
    [handleSendMessage],
  );

  const handleInspectToolInvocation = useCallback(
    (toolCallId: string | null) => {
      if (!toolCallId) {
        setFocusedToolInvocationId(null);
        setAgentToolsOpen(true);
        return;
      }

      setFocusedToolInvocationId(toolCallId);

      const invocation = executionTreeState
        ? findToolInvocationById(executionTreeState.toolInvocations, toolCallId)
        : null;
      if (invocation?.agentId) {
        setSelectedAgentId(invocation.agentId);
      }

      setAgentToolsOpen(true);
    },
    [executionTreeState, setSelectedAgentId],
  );

  const handleProviderChange = useCallback(
    (value: string) => {
      if (!selectedSessionId) {
        return;
      }

      let providerValue = value;
      if (value === '__custom__') {
        const next = window.prompt('Provider identifier', activeSettings.provider ?? '');
        providerValue = next?.trim() ?? '';
        if (!providerValue) {
          return;
        }
      }

      const entry = providerCatalog.find((item) => item.name === providerValue);
      const models = entry?.models ?? [];
      const nextModel = models.length
        ? models.includes(activeSettings.model ?? '')
          ? activeSettings.model
          : models[0]
        : activeSettings.model;

      applyChatUpdate((chat) => {
        const nextSettings = { ...(chat.sessionSettings ?? {}) };
        const current = nextSettings[selectedSessionId] ?? {};
        const updated = {
          ...current,
          provider: providerValue,
        } as { provider: string; model?: string };
        if (nextModel) {
          updated.model = nextModel;
        } else {
          delete updated.model;
        }
        nextSettings[selectedSessionId] = updated;
        return { ...chat, sessionSettings: nextSettings };
      });
    },
    [
      activeSettings.model,
      activeSettings.provider,
      applyChatUpdate,
      providerCatalog,
      selectedSessionId,
    ],
  );

  const handleTogglePanel = useCallback(
    (panelId: string, collapsed: boolean) => {
      applyChatUpdate((chat) => {
        const nextPanels = { ...(chat.collapsedPanels ?? {}) };
        nextPanels[panelId] = collapsed;
        return { ...chat, collapsedPanels: nextPanels };
      });
    },
    [applyChatUpdate],
  );

  const handleModelInputChange = useCallback(
    (value: string) => {
      if (!selectedSessionId) {
        return;
      }

      applyChatUpdate((chat) => {
        const nextSettings = { ...(chat.sessionSettings ?? {}) };
        const current = nextSettings[selectedSessionId] ?? {};
        const trimmedValue = value.trim();
        const typedCurrent = current as { provider?: string; model?: string };
        const currentModel =
          typeof typedCurrent.model === 'string' ? typedCurrent.model : '';
        if (trimmedValue === currentModel) {
          return chat;
        }
        const updated = { ...typedCurrent } as {
          provider?: string;
          model?: string;
        };
        if (trimmedValue) {
          updated.model = trimmedValue;
          if (!updated.provider && selectedProvider) {
            updated.provider = selectedProvider;
          }
        } else {
          delete updated.model;
        }
        nextSettings[selectedSessionId] = updated;
        return { ...chat, sessionSettings: nextSettings };
      });
    },
    [applyChatUpdate, selectedProvider, selectedSessionId],
  );

  const handleCreateSession = useCallback(() => {
    const title = window.prompt('Session title', 'New orchestrator session');
    if (!title?.trim()) {
      return;
    }
    const payload: CreateChatSessionDto = {
      title: title.trim(),
      description: '',
    };
    createSessionMutation.mutate(payload);
  }, [createSessionMutation]);

  const handleReissueCommand = useCallback((message: ChatMessageDto) => {
    setComposerValue(message.content);
    setComposerRole(message.role as ComposerRole);
  }, []);

  const isContextBundlesCollapsed = Boolean(collapsedPanels[PANEL_IDS.context]);

  return (
    <Sheet
      open={isAgentToolsOpen}
      onOpenChange={(open) => {
        setAgentToolsOpen(open);
        if (!open) {
          setFocusedToolInvocationId(null);
        }
      }}
    >
      <div className={cn(getSurfaceLayoutClasses('chat'), SURFACE_CONTENT_CLASS)}>
        <Flex direction="column" className="gap-6">
          <Flex align="center" gap="4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/70 to-sky-500/70 shadow-[0_25px_55px_-35px_rgba(56,189,248,0.7)]">
              <ChatBubbleIcon className="h-5 w-5 text-white" />
            </div>
            <Box className="space-y-1">
              <Heading size="6" className="text-white">
                Chat orchestrator
              </Heading>
              <Text size="2" color="gray" className="text-slate-200/85">
                Orchestrate sessions across providers and watch context and tools light up in real
                time.
              </Text>
            </Box>
          </Flex>

          <Panel
            title="Sessions"
            description={
              sessions.length === 0
                ? 'Create a session to begin orchestrating conversations.'
                : undefined
            }
            actions={
              <Button
                onClick={handleCreateSession}
                size="2"
                variant="solid"
                color="jade"
                disabled={createSessionMutation.isPending}
              >
                <PlusIcon /> New session
              </Button>
            }
          >
            <SessionSelector
              sessions={sessionsWithMetrics}
              selectedSessionId={selectedSessionId ?? null}
              onSelectSession={handleSelectSession}
              onRenameSession={handleRenameSession}
              onDeleteSession={handleDeleteSession}
              onCreateSession={handleCreateSession}
              isCreatePending={createSessionMutation.isPending}
            />
          </Panel>

          <div className="flex flex-col gap-6">
            <Panel
              title={
                sessions.find((session) => session.id === selectedSessionId)?.title ??
                'Select a session'
              }
              actions={
                <Flex align="center" gap="3" wrap="wrap">
                  <Select.Root
                    value={selectedProvider}
                    onValueChange={handleProviderChange}
                    disabled={!selectedSessionId}
                  >
                    <Select.Trigger placeholder="Provider" />
                    <Select.Content>
                      {providerOptions.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                      {providerOptions.length > 0 ? <Select.Separator /> : null}
                      <Select.Item value="__custom__">Custom provider…</Select.Item>
                    </Select.Content>
                  </Select.Root>
                  <TextField.Root
                    value={activeSettings.model ?? ''}
                    onChange={(event) =>
                      handleModelInputChange(event.target.value)
                    }
                    placeholder="Model identifier"
                    aria-label="Model"
                    disabled={!selectedSessionId}
                  />
                  <SheetTrigger asChild>
                    <Button variant="solid" size="2">
                      <MagicWandIcon /> Open agent tools
                    </Button>
                  </SheetTrigger>
                </Flex>
              }
            >
              <ChatWindow
                messages={messagesWithMetadata}
                onReissueCommand={handleReissueCommand}
                scrollAnchorRef={scrollAnchorRef}
                agentActivityState={agentActivityState}
                composerRole={composerRole}
                onComposerRoleChange={setComposerRole}
                composerRoleDisabled={composerUnavailable}
                composerValue={composerValue}
                onComposerValueChange={setComposerValue}
                composerDisabled={composerInputDisabled}
                composerSubmitDisabled={composerSubmitDisabled}
                composerPlaceholder="Send a message to the orchestrator"
                onComposerSubmit={handleComposerSubmit}
                onInspectToolInvocation={handleInspectToolInvocation}
              />
            </Panel>
          </div>
        </Flex>
      </div>

      <AgentToolsDrawer
        executionTreeState={executionTreeState}
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        focusedToolInvocationId={focusedToolInvocationId}
        onFocusToolInvocation={setFocusedToolInvocationId}
        contextPanelId={PANEL_IDS.context}
        contextBundles={selectedContextBundles}
        isContextPanelCollapsed={isContextBundlesCollapsed}
        onToggleContextPanel={handleTogglePanel}
      />
    </Sheet>
  );
}

type MessageMetadataAgent = {
  id?: string | null;
  name?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  lineage?: string[] | null;
};

type MessageMetadataTool = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
};

type ChatMessageWithMetadata = ChatMessageDto & {
  metadata?: {
    agent?: MessageMetadataAgent | null;
    tool?: MessageMetadataTool | null;
  } | null;
};

type AgentHierarchyNode = ExecutionTreeState['agentHierarchy'][number];
type ToolInvocationNode = ExecutionTreeState['toolInvocations'][number];

function enrichMessagesWithExecutionTree(
  messages: ChatMessageDto[],
  executionTree: ExecutionTreeState | null,
): ChatMessageWithMetadata[] {
  if (!executionTree) {
    return messages as ChatMessageWithMetadata[];
  }

  const toolLookup = indexToolInvocationsById(executionTree.toolInvocations);
  const agentLookup = indexAgentHierarchyById(executionTree.agentHierarchy);

  if (toolLookup.size === 0 && agentLookup.size === 0) {
    return messages as ChatMessageWithMetadata[];
  }

  return messages.map((message) => {
    if (message.role !== 'tool') {
      return message as ChatMessageWithMetadata;
    }

    const toolCallId = message.toolCallId ?? null;
    const invocation = toolCallId ? toolLookup.get(toolCallId) ?? null : null;
    const metadataUpdates: Partial<NonNullable<ChatMessageWithMetadata['metadata']>> = {};

    if (invocation) {
      metadataUpdates.tool = {
        id: invocation.id ?? toolCallId,
        name: invocation.name ?? message.name ?? null,
        status: invocation.status ?? null,
      };

      const agentId = invocation.agentId ?? null;
      if (agentId) {
        const agentNode = agentLookup.get(agentId) ?? null;
        if (agentNode) {
          const lineage = [...agentNode.lineage];
          const parentId = lineage.length >= 2 ? lineage[lineage.length - 2] ?? null : null;
          const parentName = parentId ? agentLookup.get(parentId)?.name ?? null : null;
          metadataUpdates.agent = {
            id: agentNode.id,
            name: agentNode.name ?? null,
            parentId,
            parentName,
            lineage,
          };
        }
      }
    } else if (toolCallId || message.name) {
      metadataUpdates.tool = {
        id: toolCallId ?? message.name ?? null,
        name: message.name ?? toolCallId ?? null,
        status: null,
      };
    }

    if (!metadataUpdates.agent && !metadataUpdates.tool) {
      return message as ChatMessageWithMetadata;
    }

    const mergedMetadata = mergeMessageMetadata(message.metadata, metadataUpdates);
    return mergedMetadata === message.metadata
      ? (message as ChatMessageWithMetadata)
      : { ...message, metadata: mergedMetadata };
  });
}

function mergeMessageMetadata(
  current: ChatMessageWithMetadata['metadata'],
  incoming: Partial<NonNullable<ChatMessageWithMetadata['metadata']>>,
): ChatMessageWithMetadata['metadata'] {
  const base: NonNullable<ChatMessageWithMetadata['metadata']> =
    current && typeof current === 'object' ? { ...current } : {};

  let changed = false;

  if (incoming.agent) {
    const existingAgent = base.agent ?? null;
    const mergedAgent = { ...(existingAgent ?? {}), ...incoming.agent };
    if (!shallowEqualRecord(existingAgent, mergedAgent)) {
      changed = true;
    }
    base.agent = mergedAgent;
  }
  if (incoming.tool) {
    const existingTool = base.tool ?? null;
    const mergedTool = { ...(existingTool ?? {}), ...incoming.tool };
    if (!shallowEqualRecord(existingTool, mergedTool)) {
      changed = true;
    }
    base.tool = mergedTool;
  }

  if (!base.agent && !base.tool) {
    return current ?? null;
  }

  if (!changed && current) {
    return current;
  }

  return base;
}

function shallowEqualRecord(
  left: Record<string, unknown> | null,
  right: Record<string, unknown> | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function indexAgentHierarchyById(
  nodes: ExecutionTreeState['agentHierarchy'],
): Map<string, AgentHierarchyNode> {
  const map = new Map<string, AgentHierarchyNode>();

  const visit = (node: AgentHierarchyNode) => {
    map.set(node.id, node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return map;
}

function indexToolInvocationsById(
  nodes: ExecutionTreeState['toolInvocations'],
): Map<string, ToolInvocationNode> {
  const map = new Map<string, ToolInvocationNode>();

  const visit = (node: ToolInvocationNode) => {
    map.set(node.id, node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return map;
}

function findToolInvocationById(
  nodes: ExecutionTreeState['toolInvocations'],
  id: string,
): ToolInvocationNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = findToolInvocationById(node.children ?? [], id);
    if (child) {
      return child;
    }
  }
  return null;
}

function mergeSessionList(
  previous: ChatSessionDto[],
  session: ChatSessionDto,
): ChatSessionDto[] {
  return sortSessions([session, ...previous.filter((item) => item.id !== session.id)]);
}

