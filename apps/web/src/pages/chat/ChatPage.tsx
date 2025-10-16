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
import {
  AgentTree,
  CollapsiblePanel,
  ContextBundlesPanel,
  ToolTree,
} from './components';
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

const SCROLL_VIEWPORT_SELECTOR = '[data-radix-scroll-area-viewport]';

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

function createEmptyOrchestratorMetadata(sessionId: string): OrchestratorMetadataDto {
  return {
    sessionId,
    contextBundles: [],
    toolInvocations: [],
    agentHierarchy: [],
    capturedAt: new Date().toISOString(),
  };
}

function getOrchestratorMetadataBase(
  current: OrchestratorMetadataDto | null,
  sessionId: string,
): OrchestratorMetadataDto {
  return current ?? createEmptyOrchestratorMetadata(sessionId);
}

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

type ToolRealtimeMetadataResult = Partial<
  Pick<OrchestratorMetadataDto, 'contextBundles' | 'agentHierarchy'>
> &
  Record<string, unknown>;

type ToolInvocationNode = OrchestratorMetadataDto['toolInvocations'][number];
type AgentHierarchyNode = OrchestratorMetadataDto['agentHierarchy'][number];

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

function orchestratorMetadataEquals(
  a: OrchestratorMetadataDto | null,
  b: OrchestratorMetadataDto | null,
): boolean {
  if (a === b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function mergeOrchestratorMetadata(
  current: OrchestratorMetadataDto | null,
  incoming: OrchestratorMetadataDto | null,
): OrchestratorMetadataDto | null {
  if (!incoming) {
    return current ?? null;
  }

  if (!current) {
    return incoming;
  }

  const next: OrchestratorMetadataDto = {
    ...current,
  };

  if (incoming.sessionId) {
    next.sessionId = incoming.sessionId;
  }

  if (incoming.capturedAt) {
    next.capturedAt = incoming.capturedAt;
  }

  const incomingContextBundles = incoming.contextBundles;
  if (Array.isArray(incomingContextBundles)) {
    next.contextBundles = incomingContextBundles;
  } else if (!Array.isArray(next.contextBundles)) {
    next.contextBundles = [];
  }

  const incomingAgentHierarchy = incoming.agentHierarchy;
  if (Array.isArray(incomingAgentHierarchy)) {
    next.agentHierarchy = mergeAgentHierarchyRuntimeDetails(
      current.agentHierarchy ?? [],
      incomingAgentHierarchy,
    );
  } else if (!Array.isArray(next.agentHierarchy)) {
    next.agentHierarchy = [];
  }

  const incomingToolInvocations = incoming.toolInvocations;
  if (Array.isArray(incomingToolInvocations)) {
    if (incomingToolInvocations.length === 0) {
      next.toolInvocations = [];
    } else {
      next.toolInvocations = mergeToolInvocationNodes(
        current.toolInvocations ?? [],
        incomingToolInvocations,
      );
    }
  } else {
    next.toolInvocations = current.toolInvocations ?? [];
  }

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'sessionId' || key === 'capturedAt') {
      continue;
    }

    if (key === 'contextBundles' || key === 'agentHierarchy' || key === 'toolInvocations') {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    (next as Record<string, unknown>)[key] = value;
  }

  if (orchestratorMetadataEquals(next, current)) {
    return current;
  }

  return next;
}

type AgentHierarchyNode = OrchestratorMetadataDto["agentHierarchy"][number];

function mergeAgentHierarchyRuntimeDetails(
  current: AgentHierarchyNode[],
  incoming: AgentHierarchyNode[],
): AgentHierarchyNode[] {
  const existingById = new Map(current.map((node) => [node.id, node]));

  return incoming.map((node) => {
    const existing = existingById.get(node.id);
    const incomingChildren = node.children ?? [];
    const existingChildren = existing?.children ?? [];
    const mergedChildren = mergeAgentHierarchyRuntimeDetails(
      existingChildren,
      incomingChildren,
    );

    if (!existing) {
      return {
        ...node,
        metadata: node.metadata ? { ...node.metadata } : undefined,
        children: mergedChildren,
      };
    }

    const mergedMetadata = node.metadata || existing?.metadata
      ? {
        ...(existing?.metadata ?? {}),
        ...(node.metadata ?? {}),
      }
      : undefined;

    const providerFromMetadata = (() => {
      const metadataProvider = node.metadata?.provider ?? existing?.metadata?.provider;
      return typeof metadataProvider === 'string' ? metadataProvider : undefined;
    })();

    const modelFromMetadata = (() => {
      const metadataModel = node.metadata?.model ?? existing?.metadata?.model;
      return typeof metadataModel === 'string' ? metadataModel : undefined;
    })();

    return {
      ...node,
      provider: node.provider ?? providerFromMetadata ?? existing?.provider,
      model: node.model ?? modelFromMetadata ?? existing?.model,
      depth: node.depth ?? existing?.depth,
      metadata: mergedMetadata,
      children: mergedChildren,
    };
  });
}

function normalizeOrchestratorMetadata(
  input: OrchestratorMetadataDto | null | undefined,
): OrchestratorMetadataDto | null {
  if (!input) return null;

  const toolInvocations = (input.toolInvocations ?? []).map((node) => normalizeToolInvocationNode(node));

  return { ...input, toolInvocations };
}

function cloneContextBundles(
  bundles: OrchestratorMetadataDto['contextBundles'] | null | undefined,
): OrchestratorMetadataDto['contextBundles'] {
  const source = bundles ?? [];
  return source.map((bundle) => ({
    ...bundle,
    files: bundle.files ? bundle.files.map((file) => ({ ...file })) : undefined,
  }));
}

function cloneAgentHierarchy(
  nodes: OrchestratorMetadataDto['agentHierarchy'] | null | undefined,
): OrchestratorMetadataDto['agentHierarchy'] {
  const source = nodes ?? [];
  return source.map((node) => ({
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: cloneAgentHierarchy(node.children ?? []),
  }));
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

function agentHierarchyContainsAgent(nodes: AgentHierarchyNode[], agentId: string): boolean {
  for (const node of nodes) {
    if (node.id === agentId) {
      return true;
    }

    if (agentHierarchyContainsAgent(node.children ?? [], agentId)) {
      return true;
    }
  }

  return false;
}

function filterAgentHierarchyToLineage(
  nodes: AgentHierarchyNode[],
  agentId: string,
): AgentHierarchyNode[] {
  return nodes
    .map((node) => {
      const filteredChildren = filterAgentHierarchyToLineage(node.children ?? [], agentId);

      if (node.id === agentId) {
        return {
          ...node,
          children: cloneAgentHierarchy(node.children ?? []),
        } satisfies AgentHierarchyNode;
      }

      if (filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        } satisfies AgentHierarchyNode;
      }

      return null;
    })
    .filter((node): node is AgentHierarchyNode => node != null);
}

function collectAgentIdsFromHierarchy(nodes: AgentHierarchyNode[]): Set<string> {
  const ids = new Set<string>();
  const visit = (node: AgentHierarchyNode): void => {
    ids.add(node.id);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return ids;
}

function filterToolInvocationsByAgentIds(
  nodes: ToolInvocationNode[],
  allowedAgentIds: ReadonlySet<string>,
): ToolInvocationNode[] {
  const filterNode = (node: ToolInvocationNode): ToolInvocationNode | null => {
    const filteredChildren = (node.children ?? [])
      .map((child) => filterNode(child))
      .filter((child): child is ToolInvocationNode => child != null);

    const agentId = typeof node.metadata?.agentId === 'string' ? node.metadata.agentId : null;
    if (agentId && allowedAgentIds.has(agentId)) {
      return {
        ...node,
        metadata: node.metadata ? { ...node.metadata } : undefined,
        children: filteredChildren,
      } satisfies ToolInvocationNode;
    }

    if (filteredChildren.length > 0) {
      return {
        ...node,
        metadata: node.metadata ? { ...node.metadata } : undefined,
        children: filteredChildren,
      } satisfies ToolInvocationNode;
    }

    return null;
  };

  return nodes
    .map((node) => filterNode(node))
    .filter((node): node is ToolInvocationNode => node != null);
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
  const [autoSessionAttempt, setAutoSessionAttempt] = useState<AutoSessionAttemptState>({
    status: 'idle',
    apiKey: null,
    lastAttemptAt: null,
    lastFailureAt: null,
  });
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
  const [contextBundlesBySession, setContextBundlesBySession] = useState<
    Record<string, OrchestratorMetadataDto['contextBundles']>
  >({});
  const [toolInvocationsBySession, setToolInvocationsBySession] = useState<
    Record<string, ToolInvocationNode[]>
  >({});
  const [agentHierarchyBySession, setAgentHierarchyBySession] = useState<
    Record<string, OrchestratorMetadataDto['agentHierarchy']>
  >({});
  const [capturedAtBySession, setCapturedAtBySession] = useState<Record<string, string | undefined>>({});
  const [metadataPresenceBySession, setMetadataPresenceBySession] = useState<Record<string, true>>({});
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);

  const composeOrchestratorMetadata = useCallback(
    (sessionId: string): OrchestratorMetadataDto | null => {
      if (!metadataPresenceBySession[sessionId]) {
        return null;
      }

      return {
        sessionId,
        contextBundles: contextBundlesBySession[sessionId] ?? [],
        toolInvocations: toolInvocationsBySession[sessionId] ?? [],
        agentHierarchy: agentHierarchyBySession[sessionId] ?? [],
        capturedAt: capturedAtBySession[sessionId],
      };
    },
    [
      agentHierarchyBySession,
      capturedAtBySession,
      contextBundlesBySession,
      metadataPresenceBySession,
      toolInvocationsBySession,
    ],
  );

  const syncOrchestratorMetadataCache = useCallback(
    (sessionId: string, value: OrchestratorMetadataDto | null) => {
      const queryKey = getOrchestratorMetadataQueryKey(sessionId);
      queryClient.setQueryData<OrchestratorMetadataDto | null>(queryKey, value);
    },
    [queryClient],
  );

  const applyOrchestratorMetadataUpdate = useCallback(
    (
      sessionId: string,
      updater: (current: OrchestratorMetadataDto | null) => OrchestratorMetadataDto | null,
      options?: { syncQueryCache?: boolean },
    ): OrchestratorMetadataDto | null | undefined => {
      const { syncQueryCache = true } = options ?? {};
      const current = composeOrchestratorMetadata(sessionId);
      const next = updater(current);

      if (Object.is(next, current)) {
        return current;
      }

      if (!next) {
        setContextBundlesBySession((previous) => removeSessionKey(previous, sessionId));
        setToolInvocationsBySession((previous) => removeSessionKey(previous, sessionId));
        setAgentHierarchyBySession((previous) => removeSessionKey(previous, sessionId));
        setCapturedAtBySession((previous) => removeSessionKey(previous, sessionId));
        setMetadataPresenceBySession((previous) => removeSessionKey(previous, sessionId));

        if (syncQueryCache) {
          syncOrchestratorMetadataCache(sessionId, null);
        }

        return null;
      }

      const normalized = normalizeOrchestratorMetadata(next);
      if (!normalized) {
        return current;
      }

      const normalizedSessionId = normalized.sessionId ?? sessionId;
      const normalizedContextBundles = cloneContextBundles(normalized.contextBundles);
      const normalizedToolInvocations = normalized.toolInvocations ?? [];
      const normalizedAgentHierarchy = cloneAgentHierarchy(normalized.agentHierarchy);
      const normalizedCapturedAt = normalized.capturedAt;

      const normalizedCurrent = current
        ? { ...current, sessionId: normalizedSessionId }
        : null;

      const nextMetadata: OrchestratorMetadataDto = {
        sessionId: normalizedSessionId,
        contextBundles: normalizedContextBundles,
        toolInvocations: normalizedToolInvocations,
        agentHierarchy: normalizedAgentHierarchy,
        capturedAt: normalizedCapturedAt,
      };

      if (normalizedCurrent && orchestratorMetadataEquals(nextMetadata, normalizedCurrent)) {
        if (syncQueryCache) {
          syncOrchestratorMetadataCache(sessionId, normalizedCurrent);
        }
        return normalizedCurrent;
      }

      setContextBundlesBySession((previous) => ({
        ...previous,
        [sessionId]: normalizedContextBundles,
      }));
      setToolInvocationsBySession((previous) => ({
        ...previous,
        [sessionId]: normalizedToolInvocations,
      }));
      setAgentHierarchyBySession((previous) => ({
        ...previous,
        [sessionId]: normalizedAgentHierarchy,
      }));
      setCapturedAtBySession((previous) => {
        const hasKey = sessionId in previous;
        const currentValue = previous[sessionId];
        if ((hasKey && currentValue === normalizedCapturedAt) || (!hasKey && normalizedCapturedAt === undefined)) {
          return previous;
        }

        const nextState = { ...previous } as Record<string, string | undefined>;
        if (normalizedCapturedAt === undefined) {
          delete nextState[sessionId];
        } else {
          nextState[sessionId] = normalizedCapturedAt;
        }
        return nextState;
      });
      setMetadataPresenceBySession((previous) => {
        if (previous[sessionId]) {
          return previous;
        }
        return { ...previous, [sessionId]: true };
      });

      if (syncQueryCache) {
        syncOrchestratorMetadataCache(sessionId, nextMetadata);
      }

      return nextMetadata;
    },
    [composeOrchestratorMetadata, syncOrchestratorMetadataCache],
  );

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
          mergeSessionList(previous, session),
        );
      }),
      api.sockets.chatSessions.onSessionUpdated((session) => {
        queryClient.setQueryData<ChatSessionDto[]>(['chat-sessions'], (previous = []) =>
          mergeSessionList(previous, session),
        );
      }),
      api.sockets.chatSessions.onSessionDeleted((sessionId) => {
        queryClient.setQueryData<ChatSessionDto[]>(['chat-sessions'], (previous = []) =>
          previous.filter((item) => item.id !== sessionId),
        );
        queryClient.removeQueries({ queryKey: ['chat-session', sessionId, 'messages'] });
        queryClient.removeQueries({ queryKey: ['chat-sessions', sessionId, 'messages'] });
        if (selectedSessionIdRef.current === sessionId) {
          setSelectedSessionId(null);
        }
        setContextBundlesBySession((previous) => removeSessionKey(previous, sessionId));
        setToolInvocationsBySession((previous) => removeSessionKey(previous, sessionId));
        setAgentHierarchyBySession((previous) => removeSessionKey(previous, sessionId));
        setCapturedAtBySession((previous) => removeSessionKey(previous, sessionId));
        setMetadataPresenceBySession((previous) => removeSessionKey(previous, sessionId));
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

            applyOrchestratorMetadataUpdate(sessionId, (current) => {
              const base = getOrchestratorMetadataBase(current, sessionId);

              const id = coerceToolInvocationId(p.id, 'call');
              const name = String(p.name ?? 'unknown');
              const status = (p.status ?? ('pending' as ToolCallStatusDto)) as ToolCallStatusDto;
              const createdAt = p.timestamp ?? new Date().toISOString();
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

              const nextToolInvocations = mergeToolInvocationNodes(
                base.toolInvocations ?? [],
                [node],
              );

              return {
                ...base,
                toolInvocations: nextToolInvocations,
              };
            });
          } catch {
            // ignore optimistic merge errors
          }
        }),

        toolsSockets.onToolResult((payload) => {
          try {
            const p = payload as ToolRealtimePayload;
            const sessionId = p.sessionId ?? selectedSessionIdRef.current;
            if (!sessionId) return;

            applyOrchestratorMetadataUpdate(sessionId, (current) => {
              const base = getOrchestratorMetadataBase(current, sessionId);

              const resultRecord =
                typeof p.result === 'object' && p.result !== null
                  ? (p.result as ToolRealtimeMetadataResult)
                  : undefined;
              const id = coerceToolInvocationId(p.id, 'call');
              const status = (p.status ??
                ('completed' as ToolCallStatusDto)) as ToolCallStatusDto;
              const createdAt = p.timestamp ?? new Date().toISOString();
              const resultMeta =
                typeof p.result === 'string'
                  ? { result: p.result }
                  : { ...(resultRecord ?? {}) };

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

              const nextToolInvocations = mergeToolInvocationNodes(
                base.toolInvocations ?? [],
                [node],
              );
              const contextBundlesUpdate = Array.isArray(resultRecord?.contextBundles)
                ? resultRecord.contextBundles ?? []
                : undefined;
              const agentHierarchyUpdate = Array.isArray(resultRecord?.agentHierarchy)
                ? resultRecord.agentHierarchy ?? []
                : undefined;
              const mergedAgentHierarchy = agentHierarchyUpdate
                ? mergeAgentHierarchyRuntimeDetails(
                  base.agentHierarchy ?? [],
                  agentHierarchyUpdate,
                )
                : base.agentHierarchy ?? [];

              return {
                ...base,
                toolInvocations: nextToolInvocations,
                contextBundles: contextBundlesUpdate ?? base.contextBundles ?? [],
                agentHierarchy: mergedAgentHierarchy,
                capturedAt: createdAt ?? base.capturedAt,
              };
            });
          } catch {
            // ignore optimistic merge errors
          }
        }),
      );
    }

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, applyOrchestratorMetadataUpdate, invalidateOrchestratorMetadata, queryClient]);

  const { data: orchestratorQueryData, dataUpdatedAt: orchestratorQueryUpdatedAt } = useQuery({
    queryKey: getOrchestratorMetadataQueryKey(selectedSessionId),
    enabled: Boolean(selectedSessionId),
    queryFn: async () => {
      if (!selectedSessionId) {
        return null;
      }

      const raw = await api.http.orchestrator.getMetadata(selectedSessionId);
      const normalized = normalizeOrchestratorMetadata(raw ?? null);
      const sessionId = normalized?.sessionId ?? selectedSessionId;
      const existing =
        queryClient.getQueryData<OrchestratorMetadataDto | null>(
          getOrchestratorMetadataQueryKey(sessionId),
        ) ?? null;

      if (!normalized) {
        return existing;
      }

      const target = { ...getOrchestratorMetadataBase(normalized, sessionId), sessionId };
      return mergeOrchestratorMetadata(existing, target);
    },
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (orchestratorQueryData === undefined) {
      return;
    }

    const fallbackSessionId = selectedSessionIdRef.current ?? selectedSessionId ?? null;
    if (!orchestratorQueryData && !fallbackSessionId) {
      return;
    }

    const sessionId = orchestratorQueryData?.sessionId ?? fallbackSessionId;
    if (!sessionId) {
      return;
    }

    const target = orchestratorQueryData
      ? { ...getOrchestratorMetadataBase(orchestratorQueryData, sessionId), sessionId }
      : createEmptyOrchestratorMetadata(sessionId);

    applyOrchestratorMetadataUpdate(sessionId, (current) => mergeOrchestratorMetadata(current, target));
  }, [
    applyOrchestratorMetadataUpdate,
    orchestratorQueryData,
    orchestratorQueryUpdatedAt,
    selectedSessionId,
  ]);

  const createSessionMutation = useMutation({
    mutationFn: (payload: CreateChatSessionDto) => api.http.chatSessions.create(payload),
    onSuccess: (session) => {
      resetAutoSessionAttempt();
      queryClient.setQueryData<ChatSessionDto[]>(['chat-sessions'], (previous = []) =>
        mergeSessionList(previous, session),
      );
      applyChatUpdate((chat) => ({ ...chat, selectedSessionId: session.id }));
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
    () => (selectedSessionId ? contextBundlesBySession[selectedSessionId] ?? [] : []),
    [contextBundlesBySession, selectedSessionId],
  );
  const selectedToolInvocations = useMemo(
    () => (selectedSessionId ? toolInvocationsBySession[selectedSessionId] ?? [] : []),
    [selectedSessionId, toolInvocationsBySession],
  );
  const selectedAgentHierarchy = useMemo(
    () => (selectedSessionId ? agentHierarchyBySession[selectedSessionId] ?? [] : []),
    [agentHierarchyBySession, selectedSessionId],
  );
  useEffect(() => {
    if (focusedAgentId && !agentHierarchyContainsAgent(selectedAgentHierarchy, focusedAgentId)) {
      setFocusedAgentId(null);
    }
  }, [focusedAgentId, selectedAgentHierarchy]);

  const { toolAgentHierarchy, allowedAgentIds } = useMemo(() => {
    if (!focusedAgentId) {
      return {
        toolAgentHierarchy: selectedAgentHierarchy,
        allowedAgentIds: null as ReadonlySet<string> | null,
      };
    }

    const lineage = filterAgentHierarchyToLineage(selectedAgentHierarchy, focusedAgentId);
    if (lineage.length === 0) {
      return {
        toolAgentHierarchy: selectedAgentHierarchy,
        allowedAgentIds: null as ReadonlySet<string> | null,
      };
    }

    const ids = collectAgentIdsFromHierarchy(lineage);
    return { toolAgentHierarchy: lineage, allowedAgentIds: ids };
  }, [focusedAgentId, selectedAgentHierarchy]);

  const visibleToolInvocations = useMemo(() => {
    if (!allowedAgentIds || allowedAgentIds.size === 0) {
      return selectedToolInvocations;
    }

    return filterToolInvocationsByAgentIds(selectedToolInvocations, allowedAgentIds);
  }, [selectedToolInvocations, allowedAgentIds]);
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
            <ContextBundlesPanel
              id={PANEL_IDS.context}
              bundles={selectedContextBundles}
              collapsed={Boolean(collapsedPanels[PANEL_IDS.context])}
              onToggle={handleTogglePanel}
            />

            <CollapsiblePanel
              id={PANEL_IDS.tools}
              title="Tool call tree"
              description="Live execution lineage"
              collapsed={Boolean(collapsedPanels[PANEL_IDS.tools])}
              onToggle={handleTogglePanel}
            >
              <ToolTree
                nodes={visibleToolInvocations}
                agentHierarchy={toolAgentHierarchy}
              />
            </CollapsiblePanel>

            <CollapsiblePanel
              id={PANEL_IDS.agents}
              title="Agent hierarchy"
              description="Active delegations"
              collapsed={Boolean(collapsedPanels[PANEL_IDS.agents])}
              onToggle={handleTogglePanel}
            >
              <AgentTree
                nodes={selectedAgentHierarchy}
                selectedAgentId={focusedAgentId}
                onSelectAgent={setFocusedAgentId}
              />
            </CollapsiblePanel>
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

