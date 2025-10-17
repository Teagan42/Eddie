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
  ToolCallStatusDto,
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
  contextBundles: OrchestratorMetadataDto['contextBundles'];
  agentHierarchy: OrchestratorMetadataDto['agentHierarchy'];
  toolInvocations: OrchestratorMetadataDto['toolInvocations'];
  capturedAt?: string;
};

type SessionContextBundle = SessionContextSnapshot['contextBundles'][number];
type AgentHierarchyNode = SessionContextSnapshot['agentHierarchy'][number];
type ToolInvocationNode = SessionContextSnapshot['toolInvocations'][number] & {
  args?: unknown;
  result?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

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
  hierarchy: OrchestratorMetadataDto['agentHierarchy'] | null | undefined,
): OrchestratorMetadataDto['agentHierarchy'] {
  const source = hierarchy ?? [];
  return source.map((node) => ({
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: cloneAgentHierarchy(node.children),
  }));
}

function cloneToolInvocations(
  nodes: OrchestratorMetadataDto['toolInvocations'] | null | undefined,
): OrchestratorMetadataDto['toolInvocations'] {
  const source = nodes ?? [];
  return source.map((node) => ({
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: cloneToolInvocations(node.children),
  }));
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
    contextBundles: cloneContextBundles(snapshot.contextBundles),
    agentHierarchy: cloneAgentHierarchy(snapshot.agentHierarchy),
    toolInvocations: cloneToolInvocations(snapshot.toolInvocations),
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

function createEmptySessionContext(sessionId: string): SessionContextSnapshot {
  return {
    sessionId,
    contextBundles: [],
    agentHierarchy: [],
    toolInvocations: [],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function coerceString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function normalizeAgentId(value: unknown): string | null {
  const text = coerceString(value);
  return text ?? null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function areValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function collectMetadata(
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {};
  let populated = false;

  sources.forEach((source) => {
    if (!source) {
      return;
    }
    Object.entries(source).forEach(([key, value]) => {
      if (value !== undefined) {
        merged[key] = value;
        populated = true;
      }
    });
  });

  return populated ? merged : undefined;
}

function mergeToolMetadata(
  existing: Record<string, unknown> | undefined,
  additions: Record<string, unknown> | undefined,
  agentId: string | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) };

  if (additions) {
    for (const [key, value] of Object.entries(additions)) {
      if (key === 'contextBundles') {
        continue;
      }
      next[key] = value;
    }
  }

  if (agentId !== undefined) {
    next.agentId = agentId;
  } else if (!('agentId' in next)) {
    next.agentId = null;
  }

  return next;
}

function generateTempId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeContextBundles(value: unknown): SessionContextBundle[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const bundles: SessionContextBundle[] = [];

  value.forEach((entry) => {
    if (!isPlainObject(entry)) {
      return;
    }

    const id = coerceString(entry.id) ?? coerceString(entry.contextId);
    if (!id) {
      return;
    }

    const title = coerceString(entry.title) ?? coerceString(entry.label) ?? id;
    const source = coerceString(entry.source) ?? undefined;
    const createdAt = coerceString(entry.createdAt) ?? undefined;
    const summary = coerceString(entry.summary) ?? undefined;
    const metadata = isPlainObject(entry.metadata) ? { ...entry.metadata } : undefined;

    const rawFiles = Array.isArray(entry.files)
      ? entry.files
        .map((file) => {
          if (!isPlainObject(file)) {
            return null;
          }

          const fileName = coerceString(file.name) ?? coerceString(file.path);
          const filePath = coerceString(file.path) ?? fileName ?? undefined;
          if (!fileName && !filePath) {
            return null;
          }

          const sizeBytes =
              typeof file.sizeBytes === 'number'
                ? file.sizeBytes
                : typeof file.size === 'number'
                  ? file.size
                  : 0;
          const preview = coerceString(file.preview) ?? undefined;
          const fileMetadata = isPlainObject(file.metadata)
            ? { ...file.metadata }
            : undefined;

          return {
            id: coerceString(file.id) ?? generateTempId('file'),
            name: fileName ?? filePath ?? 'Context asset',
            path: filePath ?? '',
            sizeBytes,
            preview,
            metadata: fileMetadata,
          };
        })
        .filter(
          (item): item is {
              id: string;
              name: string;
              path: string;
              sizeBytes: number;
              preview?: string;
              metadata?: Record<string, unknown>;
            } => item != null,
        )
      : undefined;

    const fileCount =
      typeof entry.fileCount === 'number'
        ? entry.fileCount
        : rawFiles?.length ?? 0;
    const sizeBytes =
      typeof entry.sizeBytes === 'number'
        ? entry.sizeBytes
        : typeof entry.size === 'number'
          ? entry.size
          : rawFiles?.reduce((total, file) => total + (file.sizeBytes ?? 0), 0) ?? 0;

    const bundle = {
      id,
      label: coerceString(entry.label) ?? title ?? id,
      title: title ?? undefined,
      source,
      createdAt,
      summary,
      metadata,
      sizeBytes,
      fileCount,
      files: rawFiles?.map((file) => ({
        path: file.path,
        sizeBytes: file.sizeBytes,
        preview: file.preview,
        name: file.name,
        id: file.id,
        metadata: file.metadata,
      })),
    } as SessionContextBundle & {
      title?: string;
      source?: string;
      createdAt?: string;
      metadata?: Record<string, unknown>;
      files?: Array<
        NonNullable<SessionContextBundle['files']>[number] & {
          id?: string;
          name?: string;
          metadata?: Record<string, unknown>;
        }
      >;
    };

    bundles.push(bundle);
  });

  return bundles.length > 0 ? bundles : null;
}

function mergeContextBundles(
  existing: SessionContextBundle[],
  updates: SessionContextBundle[],
): SessionContextBundle[] {
  if (updates.length === 0) {
    return existing;
  }

  const map = new Map<string, SessionContextBundle>();

  existing.forEach((bundle) => {
    map.set(bundle.id, {
      ...bundle,
      metadata: bundle.metadata ? { ...bundle.metadata } : undefined,
      files: bundle.files ? bundle.files.map((file) => ({ ...file })) : undefined,
    });
  });

  updates.forEach((bundle) => {
    const previous = map.get(bundle.id);
    if (!previous) {
      map.set(bundle.id, {
        ...bundle,
        metadata: bundle.metadata ? { ...bundle.metadata } : undefined,
        files: bundle.files ? bundle.files.map((file) => ({ ...file })) : undefined,
      });
      return;
    }

    map.set(bundle.id, {
      ...previous,
      ...bundle,
      metadata: {
        ...(previous.metadata ?? {}),
        ...(bundle.metadata ?? {}),
      },
      files: bundle.files
        ? bundle.files.map((file) => ({ ...file }))
        : previous.files
          ? previous.files.map((file) => ({ ...file }))
          : undefined,
    });
  });

  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    const aTime = Date.parse(a.createdAt ?? '');
    const bTime = Date.parse(b.createdAt ?? '');
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
      return a.id.localeCompare(b.id);
    }
    if (Number.isNaN(aTime)) {
      return 1;
    }
    if (Number.isNaN(bTime)) {
      return -1;
    }
    return bTime - aTime;
  });

  return merged;
}

function findAgentNodeWithParent(
  nodes: AgentHierarchyNode[],
  id: string,
): { node: AgentHierarchyNode; parent: AgentHierarchyNode | null } | null {
  const stack: Array<{ node: AgentHierarchyNode; parent: AgentHierarchyNode | null }> = nodes.map((node) => ({
    node,
    parent: null,
  }));

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.node.id === id) {
      return current;
    }

    for (const child of current.node.children ?? []) {
      stack.push({ node: child, parent: current.node });
    }
  }

  return null;
}

interface SpawnMetadata {
  agentId: string;
  parentAgentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
}

function extractSpawnMetadata(
  eventName: string | null,
  ...candidates: Array<Record<string, unknown> | undefined>
): SpawnMetadata | null {
  if (eventName?.toLowerCase() !== 'spawn_subagent') {
    return null;
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const agentId = coerceString(candidate.agentId);
    if (!agentId) {
      continue;
    }

    return {
      agentId,
      parentAgentId: coerceString(candidate.parentAgentId),
      agentName:
        coerceString(candidate.agentName) ??
        coerceString(candidate.name) ??
        agentId,
      provider:
        coerceString(candidate.provider) ??
        coerceString(candidate.agentProvider) ??
        null,
      model:
        coerceString(candidate.model) ??
        coerceString(candidate.agentModel) ??
        null,
    } satisfies SpawnMetadata;
  }

  return null;
}

function applySpawnMetadata(
  hierarchy: AgentHierarchyNode[],
  spawn: SpawnMetadata,
): boolean {
  const existingEntry = findAgentNodeWithParent(hierarchy, spawn.agentId);
  const parentEntry = spawn.parentAgentId
    ? findAgentNodeWithParent(hierarchy, spawn.parentAgentId)
    : null;
  const parentNode = parentEntry?.node ?? null;
  const targetDepth = parentNode ? (parentNode.depth ?? 0) + 1 : 0;

  if (existingEntry) {
    const { node, parent } = existingEntry;
    let changed = false;

    if (spawn.agentName && node.name !== spawn.agentName) {
      node.name = spawn.agentName;
      changed = true;
    }
    if (spawn.provider && node.provider !== spawn.provider) {
      node.provider = spawn.provider;
      changed = true;
    }
    if (spawn.model && node.model !== spawn.model) {
      node.model = spawn.model;
      changed = true;
    }
    if (node.depth !== targetDepth) {
      node.depth = targetDepth;
      changed = true;
    }

    if (parentNode && parent?.id !== parentNode.id) {
      if (parent) {
        parent.children = (parent.children ?? []).filter((child) => child.id !== node.id);
      } else {
        const index = hierarchy.findIndex((candidate) => candidate.id === node.id);
        if (index >= 0) {
          hierarchy.splice(index, 1);
        }
      }
      parentNode.children = parentNode.children ?? [];
      parentNode.children.push(node);
      changed = true;
    } else if (!parentNode && parent) {
      parent.children = (parent.children ?? []).filter((child) => child.id !== node.id);
      hierarchy.push(node);
      changed = true;
    }

    return changed;
  }

  const nextNode: AgentHierarchyNode = {
    id: spawn.agentId,
    name: spawn.agentName ?? spawn.agentId,
    provider: spawn.provider ?? undefined,
    model: spawn.model ?? undefined,
    depth: targetDepth,
    metadata: {},
    children: [],
  };

  if (parentNode) {
    parentNode.children = parentNode.children ?? [];
    parentNode.children.push(nextNode);
  } else {
    hierarchy.push(nextNode);
  }

  return true;
}

interface NormalizedToolEvent {
  sessionId: string;
  id: string;
  name: string | null;
  status: ToolCallStatusDto;
  agentId: string | null | undefined;
  timestamp: string | null;
  args?: unknown;
  result?: unknown;
  metadata?: Record<string, unknown>;
  contextBundles?: SessionContextBundle[];
  spawn?: SpawnMetadata | null;
}

function normalizeToolEvent(
  payload: unknown,
  fallbackStatus: ToolCallStatusDto,
): NormalizedToolEvent | null {
  if (!isPlainObject(payload)) {
    return null;
  }

  const sessionId = coerceString(payload.sessionId);
  const id = coerceString(payload.id) ?? coerceString(payload.toolCallId);
  if (!sessionId || !id) {
    return null;
  }

  const name = coerceString(payload.name);
  const agentIdProvided = Object.prototype.hasOwnProperty.call(payload, 'agentId');
  const agentId = agentIdProvided ? normalizeAgentId(payload.agentId) : undefined;
  const timestamp = coerceString(payload.timestamp);

  const args = 'arguments' in payload ? (payload as Record<string, unknown>).arguments : undefined;
  const result = 'result' in payload ? (payload as Record<string, unknown>).result : undefined;

  const metadataSource = isPlainObject(payload.metadata)
    ? (payload.metadata as Record<string, unknown>)
    : undefined;
  const structuredResult = parseJson(result);
  const resultMetadata =
    isPlainObject(structuredResult) && isPlainObject((structuredResult as Record<string, unknown>).metadata)
      ? ((structuredResult as Record<string, unknown>).metadata as Record<string, unknown>)
      : undefined;

  const metadata = collectMetadata(metadataSource, resultMetadata);
  if (metadata && 'contextBundles' in metadata) {
    delete metadata.contextBundles;
  }

  const contextBundles =
    sanitizeContextBundles(
      (payload as Record<string, unknown>).contextBundles ?? metadataSource?.contextBundles ?? resultMetadata?.contextBundles,
    ) ?? undefined;

  let status = fallbackStatus;
  if (typeof payload.status === 'string') {
    switch (payload.status) {
      case 'pending':
      case 'running':
      case 'completed':
      case 'failed':
        status = payload.status;
        break;
      default:
        break;
    }
  }

  return {
    sessionId,
    id,
    name: name ?? null,
    status,
    agentId: agentIdProvided ? agentId ?? null : undefined,
    timestamp: timestamp ?? null,
    args,
    result,
    metadata,
    contextBundles,
    spawn: extractSpawnMetadata(name ?? null, metadataSource, resultMetadata),
  };
}

function applyToolLifecycle(
  snapshot: SessionContextSnapshot,
  event: NormalizedToolEvent,
): boolean {
  const toolInvocations = snapshot.toolInvocations as ToolInvocationNode[];
  const timestamp = event.timestamp ?? new Date().toISOString();
  let changed = false;

  const existingIndex = toolInvocations.findIndex((node) => node.id === event.id);
  if (existingIndex >= 0) {
    const existing = toolInvocations[existingIndex]!;
    const updated: ToolInvocationNode = { ...existing };

    const nextMetadata = mergeToolMetadata(existing.metadata, event.metadata, event.agentId);
    if (!areValuesEqual(nextMetadata, existing.metadata)) {
      updated.metadata = nextMetadata;
      changed = true;
    }

    if (event.name && event.name !== existing.name) {
      updated.name = event.name;
      changed = true;
    }

    if (event.status && event.status !== existing.status) {
      updated.status = event.status;
      changed = true;
    }

    if (event.args !== undefined && !areValuesEqual(event.args, existing.args)) {
      updated.args = event.args;
      changed = true;
    }

    if (event.result !== undefined && !areValuesEqual(event.result, existing.result)) {
      updated.result = event.result;
      changed = true;
    }

    if (!existing.createdAt) {
      updated.createdAt = timestamp;
      changed = true;
    }

    if (updated.updatedAt !== timestamp) {
      updated.updatedAt = timestamp;
      changed = true;
    }

    if (changed) {
      toolInvocations[existingIndex] = updated;
    }
  } else {
    const metadata = mergeToolMetadata(undefined, event.metadata, event.agentId);
    const newNode: ToolInvocationNode = {
      id: event.id,
      name: event.name ?? 'Tool invocation',
      status: event.status,
      metadata,
      children: [],
      args: event.args,
      result: event.result,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    toolInvocations.push(newNode);
    changed = true;
  }

  if (event.contextBundles?.length) {
    const mergedBundles = mergeContextBundles(snapshot.contextBundles, event.contextBundles);
    if (!areValuesEqual(mergedBundles, snapshot.contextBundles)) {
      snapshot.contextBundles = mergedBundles;
      changed = true;
    }
  }

  if (event.spawn) {
    if (applySpawnMetadata(snapshot.agentHierarchy as AgentHierarchyNode[], event.spawn)) {
      changed = true;
    }
  }

  return changed;
}

function unsubscribeAll(unsubscribes: Array<(() => void) | undefined>): void {
  unsubscribes.forEach((unsubscribe) => {
    if (typeof unsubscribe !== 'function') {
      return;
    }
    try {
      unsubscribe();
    } catch {
      // Ignore cleanup failures caused by disposed sockets
    }
  });
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

  const upsertSessionContext = useCallback(
    (
      sessionId: string,
      updater: (snapshot: SessionContextSnapshot) => SessionContextSnapshot | null,
    ) => {
      setSessionContextById((previous) => {
        const existing = previous[sessionId] ?? createEmptySessionContext(sessionId);
        const draft =
          cloneSessionContext(existing) ?? createEmptySessionContext(sessionId);
        const next = updater(draft);
        if (!next) {
          return previous;
        }
        const normalized =
          cloneSessionContext(next) ?? createEmptySessionContext(sessionId);
        syncSessionContextCache(sessionId, normalized);
        return { ...previous, [sessionId]: normalized };
      });
    },
    [setSessionContextById, syncSessionContextCache],
  );

  const applyToolEvent = useCallback(
    (payload: unknown, fallbackStatus: ToolCallStatusDto) => {
      const normalized = normalizeToolEvent(payload, fallbackStatus);
      if (!normalized) {
        return;
      }

      upsertSessionContext(normalized.sessionId, (snapshot) => {
        const mutated = applyToolLifecycle(snapshot, normalized);
        return mutated ? snapshot : null;
      });
    },
    [upsertSessionContext],
  );

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
    (sessionId: string | null): OrchestratorMetadataDto['contextBundles'] => {
      if (!sessionId) {
        return [];
      }

      return sessionContextById[sessionId]?.contextBundles ?? [];
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

  const selectedSessionMetadata = selectedSessionId
    ? sessionContextById[selectedSessionId] ?? null
    : null;
  const executionMetadata = useMemo(() => {
    if (!selectedSessionMetadata) {
      return null;
    }

    return {
      agentHierarchy: selectedSessionMetadata.agentHierarchy,
      toolInvocations: selectedSessionMetadata.toolInvocations,
      contextBundles: selectedSessionMetadata.contextBundles,
    } satisfies Pick<
      OrchestratorMetadataDto,
      'agentHierarchy' | 'toolInvocations' | 'contextBundles'
    >;
  }, [selectedSessionMetadata]);

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
      unsubscribeAll(unsubscribes);
    };
  }, [
    api,
    invalidateSessionContext,
    synchronizeMessageCount,
    queryClient,
    setSessionContext,
    setSelectedSessionPreference,
  ]);

  useEffect(() => {
    const toolsSocket = api.sockets.tools;
    if (!toolsSocket) {
      return;
    }

    const unsubscribes = [
      toolsSocket.onToolCall((payload) => applyToolEvent(payload, 'running')),
      toolsSocket.onToolResult((payload) => applyToolEvent(payload, 'completed')),
    ];

    return () => {
      unsubscribeAll(unsubscribes);
    };
  }, [api, applyToolEvent]);

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
        contextBundles: cloneContextBundles(raw.contextBundles),
        agentHierarchy: cloneAgentHierarchy(raw.agentHierarchy),
        toolInvocations: cloneToolInvocations(raw.toolInvocations),
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

    setSessionContext(sessionId, sessionContextQueryData, { syncQueryCache: false });
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
                metadata={executionMetadata}
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

