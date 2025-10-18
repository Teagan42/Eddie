import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
} from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  ScrollArea,
  SegmentedControl,
  Select,
  Text,
  TextArea,
  Tooltip,
} from '@radix-ui/themes';
import {
  ChatBubbleIcon,
  GearIcon,
  MagicWandIcon,
  PaperPlaneIcon,
  PersonIcon,
  PlusIcon,
  ReloadIcon,
  RocketIcon,
} from '@radix-ui/react-icons';
import { AgentActivityIndicator, type AgentActivityState } from './AgentActivityIndicator';
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
import { cn } from "@/vendor/lib/utils";
import { toast } from '@/vendor/hooks/use-toast';
import { ChatMessageContent } from './ChatMessageContent';
import { getSurfaceLayoutClasses, SURFACE_CONTENT_CLASS } from '@/styles/surfaces';
import { sortSessions, upsertMessage } from './chat-utils';
import {
  AgentExecutionTree,
  ContextBundlesPanel,
  SessionSelector,
  type SessionSelectorMetricsSummary,
  type SessionSelectorSession,
} from './components';
import { useChatMessagesRealtime } from './useChatMessagesRealtime';
import {
  applyToolCallEvent,
  applyToolResultEvent,
  cloneExecutionTreeState,
  composeExecutionTreeState,
  createEmptyExecutionTreeState,
  createExecutionTreeStateFromMetadata,
  type ExecutionTreeState,
  type ToolEventPayload,
} from './execution-tree-state';

type BadgeColor = ComponentProps<typeof Badge>['color'];

const MESSAGE_CONTAINER_CLASS =
  'space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl';


const ORCHESTRATOR_METADATA_QUERY_KEY = 'orchestrator-metadata' as const;

const safelyTeardown = (teardown?: () => void): void => {
  try {
    teardown?.();
  } catch {
    // Swallow teardown errors to keep realtime resilient.
  }
};

const getOrchestratorMetadataQueryKey = (sessionId: string | null) =>
  [ORCHESTRATOR_METADATA_QUERY_KEY, sessionId] as const;

type MessageRole = ChatMessageDto['role'];

interface MessageRoleStyle {
  label: string;
  badgeColor: BadgeColor;
  align: 'start' | 'end';
  cardClassName: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  contentClassName?: string;
}

const MESSAGE_ROLE_STYLES: Record<MessageRole, MessageRoleStyle> = {
  user: {
    label: 'User',
    badgeColor: 'blue',
    align: 'end',
    cardClassName:
      'border border-emerald-400/30 bg-gradient-to-br from-emerald-500/25 via-emerald-500/5 to-slate-950/70 text-emerald-50 shadow-[0_30px_60px_-35px_rgba(16,185,129,0.7)]',
    icon: PersonIcon,
    iconClassName: 'text-emerald-200',
    contentClassName: 'leading-relaxed text-white/95',
  },
  assistant: {
    label: 'Assistant',
    badgeColor: 'green',
    align: 'start',
    cardClassName:
      'border border-sky-400/30 bg-gradient-to-br from-sky-500/25 via-sky-500/5 to-slate-950/70 text-sky-50 shadow-[0_30px_60px_-35px_rgba(56,189,248,0.6)]',
    icon: MagicWandIcon,
    iconClassName: 'text-sky-200',
    contentClassName: 'leading-relaxed text-white/95',
  },
  system: {
    label: 'Command',
    badgeColor: 'purple',
    align: 'start',
    cardClassName:
      'border border-amber-400/30 bg-gradient-to-br from-amber-500/25 via-amber-500/5 to-slate-950/70 text-amber-50 shadow-[0_30px_60px_-35px_rgba(250,204,21,0.55)]',
    icon: GearIcon,
    iconClassName: 'text-amber-200',
    contentClassName: 'text-sm font-mono text-amber-50',
  },
};

function formatTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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

type ComposerRole = CreateChatMessageDto['role'];

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

export function ChatPage(): JSX.Element {
  const api = useApi();
  const { apiKey } = useAuth();
  const queryClient = useQueryClient();
  const { preferences, updatePreferences } = useLayoutPreferences();
  useChatMessagesRealtime(api);
  const [composerValue, setComposerValue] = useState('');
  // Derive a safe default for composer role from the DTO union (fall back to 'user')
  const defaultComposerRole = 'user' as ComposerRole;
  const [composerRole, setComposerRole] = useState<ComposerRole>(defaultComposerRole);
  const [templateSelection, setTemplateSelection] = useState<string>('');
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

  const handleExecutionTreeUpdated = useCallback(
    (payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const candidate = payload as {
        sessionId?: unknown;
        state?: unknown;
      };
      const sessionId = typeof candidate.sessionId === 'string' ? candidate.sessionId : null;
      if (!sessionId) {
        return;
      }

      if (!candidate.state || typeof candidate.state !== 'object') {
        return;
      }

      const nextState = candidate.state as ExecutionTreeState;
      if (
        !Array.isArray(nextState.agentHierarchy) ||
        !Array.isArray(nextState.toolInvocations) ||
        !Array.isArray(nextState.contextBundles)
      ) {
        return;
      }

      const clonedTree = cloneExecutionTreeState(nextState);
      const capturedAt =
        typeof nextState.updatedAt === 'string' ? nextState.updatedAt : undefined;

      setSessionContext(sessionId, {
        sessionId,
        executionTree: clonedTree,
        capturedAt,
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
        safelyTeardown(unsubscribe);
      });
    };
  }, [api, handleToolLifecycleEvent]);

  useEffect(() => {
    const chatSessions = api.sockets.chatSessions;
    if (!chatSessions?.onExecutionTreeUpdated) {
      return;
    }

    const unsubscribe = chatSessions.onExecutionTreeUpdated((payload) => {
      try {
        handleExecutionTreeUpdated(payload);
      } catch {
        // Ignore handler errors to keep realtime resilient.
      }
    });

    return () => {
      safelyTeardown(unsubscribe);
    };
  }, [api, handleExecutionTreeUpdated]);

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
    setComposerRole(defaultComposerRole);
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

      if (
        activity.state === 'idle' ||
        activity.state === 'thinking' ||
        activity.state === 'tool' ||
        activity.state === 'error'
      ) {
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
  const templates = useMemo(() => preferences.chat?.templates ?? {}, [preferences.chat?.templates]);

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

  const availableModels = useMemo(() => {
    if (!selectedProvider) {
      return [] as string[];
    }
    const entry = providerCatalog.find((item) => item.name === selectedProvider);
    return entry?.models ?? [];
  }, [providerCatalog, selectedProvider]);

  const modelOptions = useMemo(() => {
    const options = [...availableModels];
    if (activeSettings.model && !options.includes(activeSettings.model)) {
      options.unshift(activeSettings.model);
    }
    return options;
  }, [activeSettings.model, availableModels]);

  const selectedModel = activeSettings.model ?? modelOptions[0] ?? '';

  const messages = messagesQuery.data ?? [];
  const selectedContextBundles = useMemo(
    () => getSessionContextBundles(selectedSessionId ?? null),
    [getSessionContextBundles, selectedSessionId],
  );
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const lastMessage = messages[messages.length - 1] ?? null;
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
  }, [lastMessage, lastMessage?.content, lastMessage?.id, messages.length]);

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

  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!event.altKey || event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      handleSendMessage();
    },
    [handleSendMessage],
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

  const handleModelChange = useCallback(
    (value: string) => {
      if (!selectedSessionId) {
        return;
      }

      if (value === '__custom__') {
        const next = window.prompt('Model identifier', selectedModel ?? '');
        const manual = next?.trim() ?? '';
        if (!manual) {
          return;
        }
        applyChatUpdate((chat) => {
          const nextSettings = { ...(chat.sessionSettings ?? {}) };
          const current = nextSettings[selectedSessionId] ?? {};
          nextSettings[selectedSessionId] = {
            ...current,
            provider: current.provider ?? selectedProvider,
            model: manual,
          };
          return { ...chat, sessionSettings: nextSettings };
        });
        return;
      }

      if (value === '__clear__') {
        applyChatUpdate((chat) => {
          const nextSettings = { ...(chat.sessionSettings ?? {}) };
          const current = nextSettings[selectedSessionId] ?? {};
          const updated = { ...current } as { provider?: string; model?: string };
          delete updated.model;
          nextSettings[selectedSessionId] = updated;
          return { ...chat, sessionSettings: nextSettings };
        });
        return;
      }

      applyChatUpdate((chat) => {
        const nextSettings = { ...(chat.sessionSettings ?? {}) };
        const current = nextSettings[selectedSessionId] ?? {};
        const updated = {
          ...current,
          model: value,
        } as { provider?: string; model?: string };
        if (!updated.provider && selectedProvider) {
          updated.provider = selectedProvider;
        }
        nextSettings[selectedSessionId] = updated;
        return { ...chat, sessionSettings: nextSettings };
      });
    },
    [applyChatUpdate, selectedModel, selectedProvider, selectedSessionId],
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

  const handleSaveTemplate = useCallback(() => {
    if (!selectedSessionId || !composerValue.trim()) {
      return;
    }
    const name = window.prompt('Template name', 'New template');
    if (!name) {
      return;
    }
    const templateId = `${selectedSessionId}-${Date.now()}`;
    const template = {
      id: templateId,
      name: name.trim(),
      provider: selectedProvider,
      model: selectedModel,
      prompt: composerValue,
      createdAt: new Date().toISOString(),
    };
    applyChatUpdate((chat) => {
      const nextTemplates = { ...(chat.templates ?? {}) };
      nextTemplates[templateId] = template;
      return { ...chat, templates: nextTemplates };
    });
  }, [applyChatUpdate, composerValue, selectedModel, selectedProvider, selectedSessionId]);

  const handleLoadTemplate = useCallback(
    (templateId: string) => {
      const template = templates[templateId];
      if (!template) {
        return;
      }
      setComposerValue(template.prompt);
      setComposerRole(defaultComposerRole);
      if (selectedSessionId) {
        applyChatUpdate((chat) => {
          const nextSettings = { ...(chat.sessionSettings ?? {}) };
          nextSettings[selectedSessionId] = {
            provider: template.provider,
            model: template.model,
          };
          return { ...chat, sessionSettings: nextSettings };
        });
      }
    },
    [applyChatUpdate, selectedSessionId, templates],
  );

  const handleTemplateSelection = useCallback(
    (value: string) => {
      setTemplateSelection(value);
      handleLoadTemplate(value);
      setTemplateSelection('');
    },
    [handleLoadTemplate],
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

  return (
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

        <div className="flex flex-col gap-6 lg:flex-row">
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
                <Select.Root
                  value={selectedModel}
                  onValueChange={handleModelChange}
                  disabled={!selectedSessionId}
                >
                  <Select.Trigger placeholder="Model" />
                  <Select.Content>
                    {modelOptions.map((model) => (
                      <Select.Item key={model} value={model}>
                        {model}
                      </Select.Item>
                    ))}
                    {modelOptions.length > 0 ? <Select.Separator /> : null}
                    <Select.Item value="__custom__">Custom model…</Select.Item>
                    {selectedModel ? (
                      <Select.Item value="__clear__">Clear model</Select.Item>
                    ) : null}
                  </Select.Content>
                </Select.Root>
                <Select.Root
                  value={templateSelection}
                  onValueChange={handleTemplateSelection}
                  disabled={Object.keys(templates).length === 0}
                >
                  <Select.Trigger placeholder="Load template" />
                  <Select.Content>
                    {Object.values(
                      templates as Record<
                        string,
                        {
                          id: string;
                          name: string;
                          provider: string;
                          model?: string;
                          prompt: string;
                        }
                      >,
                    ).map((template) => (
                      <Select.Item key={template.id} value={template.id}>
                        {template.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Button
                  variant="soft"
                  size="2"
                  onClick={handleSaveTemplate}
                  disabled={!composerValue.trim()}
                >
                  <RocketIcon /> Save template
                </Button>
              </Flex>
            }
          >
            <ScrollArea
              type="always"
              className="h-96 rounded-xl border border-muted/40 bg-muted/10 p-4"
            >
              <Flex direction="column" gap="4">
                {messages.length === 0 ? (
                  <Text size="2" color="gray">
                    No messages yet. Use the composer below to send your first command.
                  </Text>
                ) : (
                  messages.map((message) => {
                    const roleStyle = MESSAGE_ROLE_STYLES[message.role];
                    const timestamp = formatTime(message.createdAt);
                    const Icon = roleStyle.icon;
                    const alignmentClass =
                      roleStyle.align === 'end'
                        ? 'ml-auto w-full max-w-2xl'
                        : 'mr-auto w-full max-w-2xl';

                    return (
                      <Box key={message.id} className={alignmentClass}>
                        <Box className={cn(MESSAGE_CONTAINER_CLASS, roleStyle.cardClassName)}>
                          <Flex align="start" justify="between" gap="3">
                            <Flex align="center" gap="2">
                              <Box className="rounded-full bg-white/15 p-2 shadow-inner">
                                <Icon className={`h-4 w-4 ${roleStyle.iconClassName}`} />
                              </Box>
                              <Badge color={roleStyle.badgeColor} variant="soft">
                                {roleStyle.label}
                              </Badge>
                              {timestamp ? (
                                <Text size="1" color="gray">
                                  {timestamp}
                                </Text>
                              ) : null}
                            </Flex>
                            {message.role !== 'assistant' ? (
                              <Tooltip content="Re-issue command">
                                <IconButton
                                  size="1"
                                  variant="solid"
                                  onClick={() => handleReissueCommand(message)}
                                  aria-label="Re-issue command"
                                >
                                  <ReloadIcon className="h-4 w-4" />
                                </IconButton>
                              </Tooltip>
                            ) : null}
                          </Flex>
                          <ChatMessageContent
                            messageRole={message.role}
                            content={message.content}
                            className={cn('text-base text-white', roleStyle.contentClassName)}
                          />
                        </Box>
                      </Box>
                    );
                  })
                )}
                <div ref={scrollAnchorRef} data-testid="chat-scroll-anchor" aria-hidden="true" />
              </Flex>
            </ScrollArea>

            <Flex direction="column" gap="3">
              <AgentActivityIndicator state={agentActivityState} />
              <SegmentedControl.Root
                value={composerRole}
                onValueChange={(value) => setComposerRole(value as ComposerRole)}
                disabled={composerUnavailable}
              >
                <SegmentedControl.Item value="user">Ask</SegmentedControl.Item>
                <SegmentedControl.Item value="system">Run</SegmentedControl.Item>
              </SegmentedControl.Root>
              <TextArea
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Send a message to the orchestrator"
                rows={4}
                disabled={composerInputDisabled}
              />
              <Flex justify="end" gap="2">
                <Button
                  onClick={handleSendMessage}
                  disabled={composerSubmitDisabled}
                >
                  <PaperPlaneIcon /> Send
                </Button>
              </Flex>
            </Flex>
          </Panel>

          <div className="flex w-full flex-col gap-4 lg:w-[22rem] xl:w-[26rem] 2xl:w-[30rem]">
            <Panel
              title="Agent execution"
              description="Inspect tool calls, context, and spawned agents for this session."
            >
              <AgentExecutionTree
                state={executionTreeState}
                selectedAgentId={selectedAgentId}
                onSelectAgent={setSelectedAgentId}
              />
            </Panel>
            <ContextBundlesPanel
              id={PANEL_IDS.context}
              bundles={selectedContextBundles}
              collapsed={Boolean(collapsedPanels[PANEL_IDS.context])}
              onToggle={handleTogglePanel}
            />
          </div>
        </div>
      </Flex>
    </div>
  );
}
function mergeSessionList(
  previous: ChatSessionDto[],
  session: ChatSessionDto,
): ChatSessionDto[] {
  return sortSessions([session, ...previous.filter((item) => item.id !== session.id)]);
}

