import type {
  OrchestratorMetadataDto,
  OrchestratorToolCallNodeDto,
  ToolCallStatusDto,
} from '@eddie/api-client';

export type ExecutionTreeToolInvocation = OrchestratorToolCallNodeDto & {
  args?: unknown;
  result?: unknown;
  createdAt?: string;
  updatedAt?: string;
};

export interface ExecutionTreeState {
  agentHierarchy: OrchestratorMetadataDto['agentHierarchy'];
  toolInvocations: ExecutionTreeToolInvocation[];
  contextBundles: OrchestratorMetadataDto['contextBundles'];
  agentLineageById: Record<string, string[]>;
  toolGroupsByAgentId: Record<string, Record<ToolCallStatusDto, ExecutionTreeToolInvocation[]>>;
}

export interface ToolEventPayload {
  sessionId?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
  result?: unknown;
  timestamp?: string;
  agentId?: string | null;
}

const TOOL_STATUS_ORDER: ToolCallStatusDto[] = ['pending', 'running', 'completed', 'failed'];

export function createEmptyExecutionTreeState(): ExecutionTreeState {
  return composeExecutionTreeState([], [], []);
}

export function createExecutionTreeStateFromMetadata(
  metadata: OrchestratorMetadataDto,
): ExecutionTreeState {
  const clonedHierarchy = cloneAgentHierarchy(metadata.agentHierarchy ?? []);
  const clonedInvocations = cloneToolInvocations(metadata.toolInvocations ?? []);
  const clonedBundles = cloneContextBundles(metadata.contextBundles ?? []);
  return composeExecutionTreeState(clonedHierarchy, clonedInvocations, clonedBundles);
}

export function cloneExecutionTreeState(state: ExecutionTreeState): ExecutionTreeState {
  return composeExecutionTreeState(
    cloneAgentHierarchy(state.agentHierarchy),
    cloneToolInvocations(state.toolInvocations),
    cloneContextBundles(state.contextBundles),
  );
}

export function applyToolCallEvent(
  current: ExecutionTreeState,
  payload: ToolEventPayload,
): ExecutionTreeState {
  if (!payload?.id) {
    return current;
  }

  const next = cloneExecutionTreeState(current);
  const target = ensureInvocation(next.toolInvocations, payload.id);
  target.name = typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name : target.name;
  target.status = 'running';
  target.args = parseEventValue(payload.arguments);
  target.updatedAt = payload.timestamp ?? target.updatedAt ?? payload.timestamp ?? undefined;
  target.createdAt = target.createdAt ?? payload.timestamp ?? undefined;
  target.metadata = {
    ...(target.metadata ?? {}),
    agentId: normalizeAgentId(payload.agentId) ?? target.metadata?.agentId ?? null,
  };

  return rebuildDerivedState(next);
}

export function applyToolResultEvent(
  current: ExecutionTreeState,
  payload: ToolEventPayload,
): ExecutionTreeState {
  if (!payload?.id) {
    return current;
  }

  const next = cloneExecutionTreeState(current);
  const target = ensureInvocation(next.toolInvocations, payload.id);
  target.name = typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name : target.name;
  target.status = 'completed';
  target.result = parseEventValue(payload.result);
  target.updatedAt = payload.timestamp ?? target.updatedAt ?? payload.timestamp ?? undefined;
  target.metadata = {
    ...(target.metadata ?? {}),
    agentId: normalizeAgentId(payload.agentId) ?? target.metadata?.agentId ?? null,
  };

  return rebuildDerivedState(next);
}

function rebuildDerivedState(state: ExecutionTreeState): ExecutionTreeState {
  return {
    agentHierarchy: state.agentHierarchy,
    toolInvocations: state.toolInvocations,
    contextBundles: state.contextBundles,
    agentLineageById: buildAgentLineageMap(state.agentHierarchy),
    toolGroupsByAgentId: groupToolInvocations(state.toolInvocations),
  };
}

export function composeExecutionTreeState(
  hierarchy: OrchestratorMetadataDto['agentHierarchy'],
  toolInvocations: ExecutionTreeToolInvocation[],
  contextBundles: OrchestratorMetadataDto['contextBundles'],
): ExecutionTreeState {
  return {
    agentHierarchy: hierarchy,
    toolInvocations,
    contextBundles,
    agentLineageById: buildAgentLineageMap(hierarchy),
    toolGroupsByAgentId: groupToolInvocations(toolInvocations),
  };
}

function cloneAgentHierarchy(
  nodes: OrchestratorMetadataDto['agentHierarchy'],
): OrchestratorMetadataDto['agentHierarchy'] {
  return nodes.map((node) => ({
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: cloneAgentHierarchy(node.children ?? []),
  }));
}

function cloneToolInvocations(
  nodes: OrchestratorMetadataDto['toolInvocations'],
): ExecutionTreeToolInvocation[] {
  return nodes.map((node) => ({
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: cloneToolInvocations(node.children ?? []),
  }));
}

function cloneContextBundles(
  bundles: OrchestratorMetadataDto['contextBundles'],
): OrchestratorMetadataDto['contextBundles'] {
  return bundles.map((bundle) => ({
    ...bundle,
    files: Array.isArray(bundle.files)
      ? bundle.files.map((file) => ({ ...file }))
      : bundle.files,
  }));
}

function ensureInvocation(
  list: ExecutionTreeToolInvocation[],
  id: string,
): ExecutionTreeToolInvocation {
  const existing = findInvocationById(list, id);
  if (existing) {
    return existing;
  }

  const next: ExecutionTreeToolInvocation = {
    id,
    name: 'tool',
    status: 'running',
    metadata: { agentId: null },
    children: [],
  };
  list.push(next);
  return next;
}

function findInvocationById(
  nodes: ExecutionTreeToolInvocation[],
  id: string,
): ExecutionTreeToolInvocation | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const child = findInvocationById(node.children ?? [], id);
    if (child) {
      return child;
    }
  }
  return null;
}

function parseEventValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function normalizeAgentId(value: string | null | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildAgentLineageMap(
  nodes: OrchestratorMetadataDto['agentHierarchy'],
): Record<string, string[]> {
  const map = new Map<string, string[]>();

  const visit = (node: OrchestratorMetadataDto['agentHierarchy'][number], ancestors: string[]) => {
    const lineage = [...ancestors, node.id];
    map.set(node.id, lineage);
    for (const child of node.children ?? []) {
      visit(child, lineage);
    }
  };

  for (const node of nodes) {
    visit(node, []);
  }

  return Object.fromEntries(map.entries());
}

function groupToolInvocations(
  nodes: ExecutionTreeToolInvocation[],
): Record<string, Record<ToolCallStatusDto, ExecutionTreeToolInvocation[]>> {
  const grouped: Record<string, Record<ToolCallStatusDto, ExecutionTreeToolInvocation[]>> = {};

  const visit = (node: ExecutionTreeToolInvocation) => {
    const agentId =
      typeof node.metadata?.agentId === 'string' && node.metadata.agentId.trim().length > 0
        ? node.metadata.agentId
        : 'unknown';
    const status = node.status ?? 'pending';
    if (!grouped[agentId]) {
      grouped[agentId] = {} as Record<ToolCallStatusDto, ExecutionTreeToolInvocation[]>;
    }
    if (!grouped[agentId][status]) {
      grouped[agentId][status] = [];
    }
    grouped[agentId][status]?.push(node);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  for (const agentId of Object.keys(grouped)) {
    const groups = grouped[agentId];
    for (const status of TOOL_STATUS_ORDER) {
      const entries = groups[status];
      if (entries) {
        entries.sort((a, b) => resolveTimestamp(b) - resolveTimestamp(a));
      }
    }
  }

  return grouped;
}

function resolveTimestamp(node: ExecutionTreeToolInvocation): number {
  const timestamp = node.updatedAt ?? node.createdAt ?? null;
  return timestamp ? Date.parse(timestamp) : 0;
}
