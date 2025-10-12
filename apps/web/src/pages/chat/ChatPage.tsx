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
  OrchestratorMetadataDto,
  ProviderCatalogEntryDto,
  ToolCallStatusDto,
} from '@eddie/api-client';
import { useApi } from '@/api/api-provider';
import { useAuth } from '@/auth/auth-context';
import { useLayoutPreferences } from '@/hooks/useLayoutPreferences';
import type { LayoutPreferencesDto } from '@eddie/api-client';
import { Panel } from "@/components/common";
import { cn } from "@/vendor/lib/utils";
import { ChatMessageContent } from './ChatMessageContent';
import { getSurfaceLayoutClasses, SURFACE_CONTENT_CLASS } from '@/styles/surfaces';
import { summarizeObject, sortSessions, upsertMessage } from './chat-utils';
import { AgentTree, CollapsiblePanel, ToolTree } from './components';
import { useChatMessagesRealtime } from './useChatMessagesRealtime';

type BadgeColor = ComponentProps<typeof Badge>['color'];

const MESSAGE_CONTAINER_CLASS =
  'space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl';

const ORCHESTRATOR_METADATA_QUERY_KEY = 'orchestrator-metadata' as const;

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

const PANEL_IDS = {
  context: 'context-bundles',
  tools: 'tool-tree',
  agents: 'agent-hierarchy',
} as const;

type ChatPreferences = NonNullable<LayoutPreferencesDto['chat']>;

type ComposerRole = CreateChatMessageDto['role'];

type AutoSessionAttemptStatus = 'idle' | 'pending' | 'failed';

type AutoSessionAttemptState = {
  status: AutoSessionAttemptStatus;
  apiKey: string | null;
};

// Small runtime type for realtime tool events forwarded over the "tools" socket.
// We keep this conservative and shallow: server-side sanitization already
// stringifies large values, so the client only needs to read common fields.
type ToolRealtimePayload = {
  sessionId?: string | null;
  id?: string | number;
  name?: string;
  status?: ToolCallStatusDto;
  arguments?: string | Record<string, unknown>;
  result?: string | Record<string, unknown>;
  timestamp?: string | null;
};

type ToolInvocationNode = OrchestratorMetadataDto['toolInvocations'][number];

let toolInvocationIdCounter = 0;

function coerceToolInvocationId(value: unknown, fallbackPrefix = 'tool'): string {
  if (value === undefined || value === null || value === '') {
    toolInvocationIdCounter += 1;
    return `${fallbackPrefix}_${toolInvocationIdCounter}`;
  }

  return String(value);
}

function normalizeToolInvocationNode(node: ToolInvocationNode): ToolInvocationNode {
  const meta = node.metadata ?? ({} as Record<string, unknown>);

  const existingPreview = typeof meta.preview === 'string' ? meta.preview : undefined;
  const command = typeof meta.command === 'string' ? meta.command : undefined;
  const argsPreview = summarizeObject(meta.arguments ?? meta.args ?? null);
  const resultPreview = summarizeObject(meta.result ?? null);

  const preview = existingPreview ?? command ?? argsPreview ?? resultPreview ?? undefined;

  let argumentsString: string | undefined;
  if (typeof meta.arguments === 'string') {
    argumentsString = meta.arguments;
  } else if (meta.arguments != null) {
    try {
      argumentsString = JSON.stringify(meta.arguments);
    } catch {
      argumentsString = undefined;
    }
  }

  return {
    ...node,
    id: coerceToolInvocationId(node.id),
    metadata: {
      ...meta,
      preview,
      command,
      arguments: argumentsString ?? meta.arguments,
    },
    children: (node.children ?? []).map((child) => normalizeToolInvocationNode(child)),
  } as ToolInvocationNode;
}

function mergeToolInvocationNodes(
  existing: ToolInvocationNode[],
  incoming: ToolInvocationNode[],
): ToolInvocationNode[] {
  const normalizedExisting = existing.map((node) => normalizeToolInvocationNode(node));
  const normalizedIncoming = incoming.map((node) => normalizeToolInvocationNode(node));

  const byId = new Map<string, ToolInvocationNode>();
  const result: ToolInvocationNode[] = normalizedExisting.map((node) => {
    const clone: ToolInvocationNode = {
      ...node,
      metadata: { ...(node.metadata ?? {}) },
      children: [...(node.children ?? [])],
    };
    byId.set(clone.id, clone);
    return clone;
  });

  for (const node of normalizedIncoming) {
    const current = byId.get(node.id);
    if (current) {
      const mergedChildren = mergeToolInvocationNodes(current.children ?? [], node.children ?? []);
      const mergedMetadata: Record<string, unknown> = {
        ...(current.metadata ?? {}),
      };

      if (node.metadata) {
        for (const [key, value] of Object.entries(node.metadata)) {
          if (value !== null && value !== undefined) {
            mergedMetadata[key] = value;
          }
        }
      }

      const merged: ToolInvocationNode = {
        ...current,
        children: mergedChildren,
        metadata: mergedMetadata as ToolInvocationNode['metadata'],
      };

      for (const [key, value] of Object.entries(node)) {
        if (key === 'metadata' || key === 'children') {
          continue;
        }

        if (value !== null && value !== undefined) {
          (merged as Record<string, unknown>)[key] = value;
        }
      }
      byId.set(node.id, merged);
      const index = result.findIndex((item) => item.id === node.id);
      if (index >= 0) {
        result[index] = merged;
      } else {
        result.push(merged);
      }
    } else {
      byId.set(node.id, node);
      result.push(node);
    }
  }

  return result;
}

function normalizeOrchestratorMetadata(
  input: OrchestratorMetadataDto | null | undefined,
): OrchestratorMetadataDto | null {
  if (!input) return null;

  const toolInvocations = (input.toolInvocations ?? []).map((node) => normalizeToolInvocationNode(node));

  return { ...input, toolInvocations };
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
    queryKey: ['chat-sessions'],
    queryFn: () => api.http.chatSessions.list(),
  });

  const sessions = useMemo(() => sortSessions(sessionsQuery.data ?? []), [sessionsQuery.data]);
  const sessionsLoaded = sessionsQuery.isSuccess;

  const selectedSessionIdRef = useRef<string | null>(null);
  const autoSessionAttemptRef = useRef<AutoSessionAttemptState>({
    status: 'idle',
    apiKey: null,
  });
  const setAutoSessionAttemptState = useCallback(
    (updates: Partial<AutoSessionAttemptState>) => {
      Object.assign(autoSessionAttemptRef.current, updates);
    },
    [],
  );
  const agentActivitySessionRef = useRef<string | null>(null);
  const toolInvocationCacheRef = useRef<Map<string, ToolInvocationNode[]>>(new Map());

  const invalidateOrchestratorMetadata = useCallback(
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

  const selectedSessionId = useMemo(() => {
    if (preferences.chat?.selectedSessionId) {
      return preferences.chat.selectedSessionId;
    }
    return sessions[0]?.id ?? null;
  }, [preferences.chat?.selectedSessionId, sessions]);

  selectedSessionIdRef.current = selectedSessionId ?? null;

  useEffect(() => {
    if (!preferences.chat?.selectedSessionId && sessions[0]?.id) {
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: sessions[0]!.id }));
    }
  }, [applyChatUpdate, preferences.chat?.selectedSessionId, sessions]);

  useEffect(() => {
    setComposerValue('');
    setComposerRole(defaultComposerRole);
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
        queryClient.setQueryData<ChatSessionDto[]>(['chat-sessions'], (previous = []) =>
          sortSessions([session, ...previous.filter((item) => item.id !== session.id)]),
        );
      }),
      api.sockets.chatSessions.onSessionUpdated((session) => {
        queryClient.setQueryData<ChatSessionDto[]>(['chat-sessions'], (previous = []) =>
          sortSessions([session, ...previous.filter((item) => item.id !== session.id)]),
        );
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
      }),
    ];

    const traceSockets = api.sockets.traces;
    if (traceSockets) {
      unsubscribes.push(
        traceSockets.onTraceCreated((trace) => {
          invalidateOrchestratorMetadata(trace.sessionId);
        }),
        traceSockets.onTraceUpdated((trace) => {
          invalidateOrchestratorMetadata(trace.sessionId);
        }),
      );
    }

    // Tools realtime: optimistic updates to the orchestrator metadata cache so
    // the ToolTree reflects live tool.call / tool.result events while the
    // server-side snapshot is refreshed in the background.
    const toolsSockets = api.sockets.tools;
    if (toolsSockets) {
      unsubscribes.push(
        toolsSockets.onToolCall((payload) => {
          try {
            const p = payload as ToolRealtimePayload;
            const sessionId = p.sessionId ?? selectedSessionIdRef.current;
            if (!sessionId) return;

            queryClient.setQueryData<OrchestratorMetadataDto | null>(
              getOrchestratorMetadataQueryKey(sessionId),
              (current) => {
                const base: OrchestratorMetadataDto = current ?? {
                  contextBundles: [],
                  toolInvocations: [],
                  agentHierarchy: [],
                  sessionId,
                  capturedAt: new Date().toISOString(),
                };

                const id = coerceToolInvocationId(p.id, 'call');
                const name = String(p.name ?? 'unknown');
                const status = (p.status ?? ('pending' as ToolCallStatusDto)) as ToolCallStatusDto;
                const createdAt = p.timestamp ?? new Date().toISOString();
                // Normalize arguments into either a preview/command or arguments string
                const argMeta =
                  typeof p.arguments === 'string'
                    ? { arguments: p.arguments, command: p.arguments, preview: p.arguments }
                    : (() => {
                      const summary = summarizeObject(p.arguments);
                      return {
                        arguments: summary ?? JSON.stringify(p.arguments),
                        preview: summary ?? undefined,
                      };
                    })();

                const node = normalizeToolInvocationNode({
                  id,
                  name,
                  status,
                  metadata: {
                    ...argMeta,
                    createdAt,
                  },
                  children: [],
                });

                const nextToolInvocations = mergeToolInvocationNodes(base.toolInvocations, [node]);
                const next = { ...base, toolInvocations: nextToolInvocations };
                toolInvocationCacheRef.current.set(sessionId, nextToolInvocations);
                return next;
              },
            );
          } catch {
            // ignore optimistic merge errors
          }
        }),

        toolsSockets.onToolResult((payload) => {
          try {
            const p = payload as ToolRealtimePayload;
            const sessionId = p.sessionId ?? selectedSessionIdRef.current;
            if (!sessionId) return;

            queryClient.setQueryData<OrchestratorMetadataDto | null>(
              getOrchestratorMetadataQueryKey(sessionId),
              (current) => {
                const base: OrchestratorMetadataDto = current ?? {
                  contextBundles: [],
                  toolInvocations: [],
                  agentHierarchy: [],
                  sessionId,
                  capturedAt: new Date().toISOString(),
                };

                const id = coerceToolInvocationId(p.id, 'call');
                const status = (p.status ??
                  ('completed' as ToolCallStatusDto)) as ToolCallStatusDto;
                const createdAt = p.timestamp ?? new Date().toISOString();
                const resultMeta =
                  typeof p.result === 'string' ? { result: p.result } : { ...(p.result ?? {}) };

                const previewFromArgs =
                  typeof p.arguments === 'string'
                    ? p.arguments
                    : (summarizeObject(p.arguments) ?? undefined);

                const node = normalizeToolInvocationNode({
                  id,
                  name: String(p.name ?? 'unknown'),
                  status,
                  metadata: {
                    ...resultMeta,
                    preview: previewFromArgs ?? summarizeObject(p.result) ?? undefined,
                    arguments:
                      typeof p.arguments === 'string'
                        ? p.arguments
                        : (summarizeObject(p.arguments) ?? undefined),
                    createdAt,
                  },
                  children: [],
                });

                const nextToolInvocations = mergeToolInvocationNodes(base.toolInvocations, [node]);
                const next = { ...base, toolInvocations: nextToolInvocations };
                toolInvocationCacheRef.current.set(sessionId, nextToolInvocations);
                return next;
              },
            );
          } catch {
            // ignore optimistic merge errors
          }
        }),
      );
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, invalidateOrchestratorMetadata, queryClient]);

  const orchestratorQuery = useQuery({
    queryKey: getOrchestratorMetadataQueryKey(selectedSessionId),
    enabled: Boolean(selectedSessionId),
    queryFn: () =>
      selectedSessionId
        ? api.http.orchestrator.getMetadata(selectedSessionId)
        : Promise.resolve({
          contextBundles: [],
          toolInvocations: [],
          agentHierarchy: [],
        }),
    select: (data) => {
      const normalized = normalizeOrchestratorMetadata(data ?? null);
      if (!normalized) {
        return null;
      }

      const sessionId = normalized.sessionId ?? selectedSessionId ?? null;
      if (!sessionId) {
        return normalized;
      }

      if (normalized.toolInvocations.length === 0) {
        const cached = toolInvocationCacheRef.current.get(sessionId);
        if (
          cached &&
          cached.length > 0 &&
          selectedSessionIdRef.current &&
          selectedSessionIdRef.current === sessionId
        ) {
          return { ...normalized, toolInvocations: cached };
        }

        toolInvocationCacheRef.current.set(sessionId, []);
        return normalized;
      }

      const cached = toolInvocationCacheRef.current.get(sessionId) ?? [];
      const merged = mergeToolInvocationNodes(cached, normalized.toolInvocations);
      toolInvocationCacheRef.current.set(sessionId, merged);
      return { ...normalized, toolInvocations: merged };
    },
    refetchInterval: 10_000,
  });

  const createSessionMutation = useMutation({
    mutationFn: (payload: CreateChatSessionDto) => api.http.chatSessions.create(payload),
    onSuccess: (session) => {
      setAutoSessionAttemptState({ status: 'idle' });
      queryClient.setQueryData<ChatSessionDto[]>(['chat-sessions'], (previous = []) =>
        sortSessions([session, ...previous]),
      );
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: session.id }));
    },
    onError: () => {
      setAutoSessionAttemptState({ status: 'failed' });
    },
  });
  const isCreatingSession = createSessionMutation.isPending;

  useEffect(() => {
    const currentKey = apiKey ?? null;
    if (autoSessionAttemptRef.current.apiKey !== currentKey) {
      setAutoSessionAttemptState({ apiKey: currentKey, status: 'idle' });
    }
  }, [apiKey]);

  useEffect(() => {
    if (sessions.length > 0) {
      setAutoSessionAttemptState({ status: 'idle' });
    }
  }, [sessions.length]);

  useEffect(() => {
    if (!apiKey || !sessionsLoaded || sessions.length > 0) {
      return;
    }

    if (autoSessionAttemptRef.current.status !== 'idle' || isCreatingSession) {
      return;
    }

    setAutoSessionAttemptState({ status: 'pending', apiKey: apiKey ?? null });
    createSessionMutation.mutate({
      title: 'New orchestrator session',
      description: '',
    });
  }, [apiKey, createSessionMutation, isCreatingSession, sessions.length, sessionsLoaded]);

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
  const orchestratorMetadata: OrchestratorMetadataDto | null = orchestratorQuery.data ?? null;
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

    scrollAnchorRef.current?.scrollIntoView({ block: 'end' });
  }, [lastMessage, lastMessage?.content, lastMessage?.id, messages.length]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === selectedSessionId) {
        return;
      }
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: sessionId }));
    },
    [applyChatUpdate, selectedSessionId],
  );

  const composerUnavailable = !apiKey || !selectedSessionId;
  const composerSubmitDisabled = composerUnavailable || !composerValue.trim();
  const composerInputDisabled = composerUnavailable || sendMessageMutation.isPending;

  const handleSendMessage = useCallback(() => {
    if (!apiKey || !selectedSessionId || !composerValue.trim()) {
      return;
    }
    sendMessageMutation.mutate({
      sessionId: selectedSessionId,
      message: {
        role: composerRole,
        content: composerValue.trim(),
      },
    });
  }, [apiKey, composerRole, composerValue, selectedSessionId, sendMessageMutation]);

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
          <ScrollArea type="always" className="mt-4 max-h-40">
            <Flex gap="2" wrap="wrap">
              {sessions.length === 0 ? (
                <Text size="2" color="gray">
                  No sessions yet.
                </Text>
              ) : (
                sessions.map((session) => (
                  <Button
                    key={session.id}
                    size="2"
                    variant={session.id === selectedSessionId ? 'solid' : 'soft'}
                    color={session.id === selectedSessionId ? 'jade' : 'gray'}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <Flex align="center" gap="2">
                      <span>{session.title}</span>
                      {session.status === 'archived' ? (
                        <Badge color="gray" variant="soft">
                          Archived
                        </Badge>
                      ) : null}
                    </Flex>
                  </Button>
                ))
              )}
            </Flex>
          </ScrollArea>
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
                                  size="2"
                                  variant="soft"
                                  onClick={() => handleReissueCommand(message)}
                                  aria-label="Re-issue command"
                                >
                                  <ReloadIcon />
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
            <CollapsiblePanel
              id={PANEL_IDS.context}
              title="Context bundles"
              description="Datasets staged for the next invocation"
              collapsed={Boolean(collapsedPanels[PANEL_IDS.context])}
              onToggle={handleTogglePanel}
            >
              {orchestratorMetadata?.contextBundles?.length ? (
                <ul className="space-y-2">
                  {orchestratorMetadata.contextBundles.map((bundle) => (
                    <li key={bundle.id} className="rounded-lg border border-muted/40 p-3">
                      <Text weight="medium">{bundle.label}</Text>
                      {bundle.summary ? (
                        <Text size="2" color="gray">
                          {bundle.summary}
                        </Text>
                      ) : null}
                      <Text size="1" color="gray">
                        {bundle.fileCount} files • {bundle.sizeBytes.toLocaleString()} bytes
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text size="2" color="gray">
                  No context bundles associated yet.
                </Text>
              )}
            </CollapsiblePanel>

            <CollapsiblePanel
              id={PANEL_IDS.tools}
              title="Tool call tree"
              description="Live execution lineage"
              collapsed={Boolean(collapsedPanels[PANEL_IDS.tools])}
              onToggle={handleTogglePanel}
            >
              <ToolTree nodes={orchestratorMetadata?.toolInvocations ?? []} />
            </CollapsiblePanel>

            <CollapsiblePanel
              id={PANEL_IDS.agents}
              title="Agent hierarchy"
              description="Active delegations"
              collapsed={Boolean(collapsedPanels[PANEL_IDS.agents])}
              onToggle={handleTogglePanel}
            >
              <AgentTree nodes={orchestratorMetadata?.agentHierarchy ?? []} />
            </CollapsiblePanel>
          </div>
        </div>
      </Flex>
    </div>
  );
}
