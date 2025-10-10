import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
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
  ChevronDownIcon,
  ChevronRightIcon,
  GearIcon,
  MagicWandIcon,
  PaperPlaneIcon,
  PersonIcon,
  PlusIcon,
  ReloadIcon,
  RocketIcon,
} from '@radix-ui/react-icons';
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
import { useLayoutPreferences } from '@/hooks/useLayoutPreferences';
import type { LayoutPreferencesDto } from '@eddie/api-client';
import { cn } from '@/components/lib/utils';
import { Panel } from '@/components/panel';
import { ChatMessageContent } from './ChatMessageContent';
import { getSurfaceLayoutClasses, SURFACE_CONTENT_CLASS } from '@/styles/surfaces';
import { sortSessions, upsertMessage } from './chat-utils';
import { useChatMessagesRealtime } from './useChatMessagesRealtime';

type BadgeColor = ComponentProps<typeof Badge>['color'];

const TOOL_STATUS_COLORS: Record<ToolCallStatusDto, BadgeColor> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
};

const SIDEBAR_PANEL_CLASS =
  'relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-sky-500/12 via-slate-900/70 to-slate-900/40 shadow-[0_35px_65px_-45px_rgba(56,189,248,0.55)] backdrop-blur-xl';
const MESSAGE_CONTAINER_CLASS =
  'space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-xl';

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
      'border border-emerald-400/30 bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-slate-900/60 text-emerald-50 shadow-[0_30px_60px_-35px_rgba(16,185,129,0.7)]',
    icon: PersonIcon,
    iconClassName: 'text-emerald-200',
    contentClassName: 'whitespace-pre-wrap leading-relaxed text-emerald-50',
  },
  assistant: {
    label: 'Assistant',
    badgeColor: 'green',
    align: 'start',
    cardClassName:
      'border border-sky-400/30 bg-gradient-to-br from-sky-500/20 via-sky-500/10 to-slate-900/60 text-sky-50 shadow-[0_30px_60px_-35px_rgba(56,189,248,0.6)]',
    icon: MagicWandIcon,
    iconClassName: 'text-sky-200',
    contentClassName: 'whitespace-pre-wrap leading-relaxed text-sky-50',
  },
  system: {
    label: 'Command',
    badgeColor: 'purple',
    align: 'start',
    cardClassName:
      'border border-amber-400/30 bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-slate-900/60 text-amber-50 shadow-[0_30px_60px_-35px_rgba(250,204,21,0.55)]',
    icon: GearIcon,
    iconClassName: 'text-amber-200',
    contentClassName: 'whitespace-pre-wrap text-sm font-mono text-amber-100',
  },
};

function formatTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const PANEL_IDS = {
  context: 'context-bundles',
  tools: 'tool-tree',
  agents: 'agent-hierarchy',
} as const;

type ChatPreferences = NonNullable<LayoutPreferencesDto['chat']>;

type ComposerRole = CreateChatMessageDto['role'];

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
};

interface CollapsiblePanelProps {
  id: string;
  title: string;
  description?: string;
  collapsed: boolean;
  onToggle: (id: string, collapsed: boolean) => void;
  children: ReactNode;
}

function CollapsiblePanel({
  id,
  title,
  description,
  collapsed,
  onToggle,
  children,
}: CollapsiblePanelProps): JSX.Element {
  return (
    <section className={`${SIDEBAR_PANEL_CLASS} flex flex-col gap-3 p-5 text-white`}>
      <Flex align="center" justify="between" gap="3">
        <Box>
          <Heading as="h3" size="3">
            {title}
          </Heading>
          {description ? (
            <Text size="2" color="gray">
              {description}
            </Text>
          ) : null}
        </Box>
        <Tooltip content={collapsed ? 'Expand' : 'Collapse'}>
          <IconButton
            variant="soft"
            size="2"
            onClick={() => onToggle(id, !collapsed)}
            aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </IconButton>
        </Tooltip>
      </Flex>
      {!collapsed ? <Box className="text-sm text-slate-200/90">{children}</Box> : null}
    </section>
  );
}

function ToolTree({ nodes }: { nodes: OrchestratorMetadataDto['toolInvocations'] }): JSX.Element {
  if (nodes.length === 0) {
    return (
      <Text size="2" color="gray">
        No tool calls recorded for this session yet.
      </Text>
    );
  }

  return (
    <ul className="space-y-3">
      {nodes.map((node) => {
        const statusColor = TOOL_STATUS_COLORS[node.status] ?? 'gray';
        const command =
          typeof node.metadata?.command === 'string'
            ? node.metadata.command
            : typeof node.metadata?.preview === 'string'
              ? node.metadata.preview
              : null;
        const executedAt = formatDateTime(node.metadata?.createdAt);
        const args = typeof node.metadata?.arguments === 'string' ? node.metadata.arguments : null;

        return (
          <li key={node.id} className="rounded-xl border border-muted/40 bg-muted/10 p-4">
            <Flex align="center" justify="between" gap="3">
              <Flex align="center" gap="2">
                <Badge variant="soft" color="gray">
                  Tool
                </Badge>
                <Text weight="medium" className="font-mono text-sm">
                  {node.name}
                </Text>
              </Flex>
              <Badge color={statusColor} variant="soft">
                {node.status.toUpperCase()}
              </Badge>
            </Flex>

            {command ? (
              <Box className="mt-3 rounded-md bg-background/80 p-3 font-mono text-xs text-foreground/80">
                {command}
              </Box>
            ) : null}

            <Flex align="center" justify={args ? 'between' : 'start'} className="mt-3" gap="2">
              {executedAt ? (
                <Text size="1" color="gray">
                  Captured {executedAt}
                </Text>
              ) : null}
              {args ? (
                <Text size="1" color="gray">
                  Args: {args}
                </Text>
              ) : null}
            </Flex>

            {node.children.length > 0 ? (
              <Box className="mt-3 border-l border-dashed border-muted/50 pl-3">
                <ToolTree nodes={node.children} />
              </Box>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function AgentTree({ nodes }: { nodes: OrchestratorMetadataDto['agentHierarchy'] }): JSX.Element {
  if (nodes.length === 0) {
    return (
      <Text size="2" color="gray">
        Orchestrator has not spawned any agents yet.
      </Text>
    );
  }

  return (
    <ul className="space-y-3">
      {nodes.map((node) => {
        const providerLabel = node.provider ?? 'Unknown provider';
        const modelLabel = node.model ?? 'Unknown model';
        const depth = typeof node.depth === 'number' ? node.depth : null;
        const messageCount =
          typeof node.metadata?.messageCount === 'number' ? node.metadata.messageCount : null;

        return (
          <li key={node.id} className="rounded-xl border border-muted/40 bg-muted/5 p-4">
            <Flex direction="column" gap="2">
              <Flex align="center" gap="2">
                <Text weight="medium">{node.name}</Text>
                {depth !== null ? (
                  <Badge variant="soft" color="gray">
                    depth {depth}
                  </Badge>
                ) : null}
              </Flex>
              <Flex align="center" gap="2">
                <Badge variant="soft" color="blue">
                  {providerLabel}
                </Badge>
                <Badge variant="soft" color="gray">
                  {modelLabel}
                </Badge>
              </Flex>
              {messageCount !== null ? (
                <Text size="1" color="gray">
                  Messages observed: {messageCount}
                </Text>
              ) : null}
              {node.children.length > 0 ? (
                <Box className="border-l border-dashed border-muted/50 pl-3">
                  <AgentTree nodes={node.children} />
                </Box>
              ) : null}
            </Flex>
          </li>
        );
      })}
    </ul>
  );
}

export function ChatPage(): JSX.Element {
  const api = useApi();
  const queryClient = useQueryClient();
  const { preferences, updatePreferences } = useLayoutPreferences();
  useChatMessagesRealtime(api);
  const [composerValue, setComposerValue] = useState('');
  // Derive a safe default for composer role from the DTO union (fall back to 'user')
  const defaultComposerRole = 'user' as ComposerRole;
  const [composerRole, setComposerRole] = useState<ComposerRole>(defaultComposerRole);
  const [templateSelection, setTemplateSelection] = useState<string>('');

  const sessionsQuery = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => api.http.chatSessions.list(),
  });

  const sessions = useMemo(() => sortSessions(sessionsQuery.data ?? []), [sessionsQuery.data]);

  const selectedSessionIdRef = useRef<string | null>(null);

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

                const id = String(p.id ?? `call_${Date.now()}`);
                const name = String(p.name ?? 'unknown');
                const status = (p.status ?? ('pending' as ToolCallStatusDto)) as ToolCallStatusDto;
                const metadata =
                  typeof p.arguments === 'string'
                    ? {
                        ...(base.toolInvocations.find((t) => t.id === id)?.metadata ?? {}),
                        arguments: p.arguments,
                      }
                    : {
                        ...(base.toolInvocations.find((t) => t.id === id)?.metadata ?? {}),
                        ...(p.arguments ?? {}),
                      };

                const existingIndex = base.toolInvocations.findIndex((n) => n.id === id);
                if (existingIndex >= 0) {
                  const updated = {
                    ...base.toolInvocations[existingIndex],
                    name,
                    status,
                    metadata,
                  };
                  const next = [...base.toolInvocations];
                  next[existingIndex] = updated;
                  return { ...base, toolInvocations: next };
                }

                const node = {
                  id,
                  name,
                  status,
                  metadata,
                  children: [],
                };

                return { ...base, toolInvocations: [...base.toolInvocations, node] };
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

                const id = String(p.id ?? `call_${Date.now()}`);
                const status = (p.status ??
                  ('completed' as ToolCallStatusDto)) as ToolCallStatusDto;
                const resultMeta =
                  typeof p.result === 'string' ? { result: p.result } : { ...(p.result ?? {}) };

                const existingIndex = base.toolInvocations.findIndex((n) => n.id === id);
                if (existingIndex >= 0) {
                  const updated = {
                    ...base.toolInvocations[existingIndex],
                    status,
                    metadata: {
                      ...(base.toolInvocations[existingIndex].metadata ?? {}),
                      ...resultMeta,
                    },
                  };
                  const next = [...base.toolInvocations];
                  next[existingIndex] = updated;
                  return { ...base, toolInvocations: next };
                }

                // If we don't have the call yet, create a completed node so the
                // tree shows it immediately.
                const node = {
                  id,
                  name: String(p.name ?? 'unknown'),
                  status,
                  metadata: resultMeta,
                  children: [],
                };

                return { ...base, toolInvocations: [...base.toolInvocations, node] };
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
    refetchInterval: 10_000,
  });

  const createSessionMutation = useMutation({
    mutationFn: (payload: CreateChatSessionDto) => api.http.chatSessions.create(payload),
    onSuccess: (session) => {
      queryClient.setQueryData<ChatSessionDto[]>(['chat-sessions'], (previous = []) =>
        sortSessions([session, ...previous]),
      );
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: session.id }));
    },
  });

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

  useEffect(() => {
    if (!lastMessage) {
      return;
    }

    scrollAnchorRef.current?.scrollIntoView({ block: 'end' });
  }, [lastMessage?.content, lastMessage?.id, messages.length]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === selectedSessionId) {
        return;
      }
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: sessionId }));
    },
    [applyChatUpdate, selectedSessionId],
  );

  const handleSendMessage = useCallback(() => {
    if (!selectedSessionId || !composerValue.trim()) {
      return;
    }
    sendMessageMutation.mutate({
      sessionId: selectedSessionId,
      message: {
        role: composerRole,
        content: composerValue.trim(),
      },
    });
  }, [composerRole, composerValue, selectedSessionId, sendMessageMutation]);

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
                            className={cn('text-sm text-slate-100', roleStyle.contentClassName)}
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
              <SegmentedControl.Root
                value={composerRole}
                onValueChange={(value) => setComposerRole(value as ComposerRole)}
              >
                <SegmentedControl.Item value="user">Ask</SegmentedControl.Item>
                <SegmentedControl.Item value="system">Run</SegmentedControl.Item>
              </SegmentedControl.Root>
              <TextArea
                value={composerValue}
                onChange={(event) => setComposerValue(event.target.value)}
                placeholder="Send a message to the orchestrator"
                rows={4}
                disabled={!selectedSessionId || sendMessageMutation.isPending}
              />
              <Flex justify="end" gap="2">
                <Button
                  onClick={handleSendMessage}
                  disabled={!selectedSessionId || !composerValue.trim()}
                >
                  <PaperPlaneIcon /> Send
                </Button>
              </Flex>
            </Flex>
          </Panel>

          <div className="flex w-full flex-col gap-4 lg:w-80">
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
