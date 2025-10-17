import type { OrchestratorMetadataDto, ToolCallStatusDto } from '@eddie/api-client';
import { summarizeObject } from './chat-utils';

export type ExecutionTreeState = OrchestratorMetadataDto & {
  sessionId: string;
};

export type ToolSocketEventType = 'tool.call' | 'tool.result';

export interface ToolSocketPayload {
  sessionId?: string | null;
  id?: string | null;
  name?: string | null;
  arguments?: unknown;
  result?: unknown;
  timestamp?: string | null;
  agentId?: string | null;
}

type InternalToolNode = ExecutionTreeState['toolInvocations'][number] & {
  createdAt?: string;
  updatedAt?: string;
};

type InternalAgentNode = ExecutionTreeState['agentHierarchy'][number];

export function createExecutionTreeState(
  snapshot: OrchestratorMetadataDto & { sessionId?: string | null },
): ExecutionTreeState {
  return {
    sessionId: snapshot.sessionId ?? '',
    capturedAt: snapshot.capturedAt ?? new Date().toISOString(),
    contextBundles: cloneContextBundles(snapshot.contextBundles ?? []),
    toolInvocations: (snapshot.toolInvocations ?? []).map(cloneToolInvocation),
    agentHierarchy: (snapshot.agentHierarchy ?? []).map(cloneAgentNode),
  };
}

export function applyToolSocketEvent(
  current: ExecutionTreeState,
  payload: ToolSocketPayload,
  type: ToolSocketEventType,
): ExecutionTreeState {
  if (!current.sessionId || (payload.sessionId && payload.sessionId !== current.sessionId)) {
    return current;
  }

  const next: ExecutionTreeState = {
    ...current,
    toolInvocations: current.toolInvocations.map(cloneToolInvocation),
    agentHierarchy: current.agentHierarchy.map(cloneAgentNode),
    contextBundles: cloneContextBundles(current.contextBundles),
  };

  const normalizedId = normalizeToolInvocationId(payload, current.sessionId);
  const timestamp = normalizeTimestamp(payload.timestamp);
  const status = resolveStatus(type, payload.result);
  const agentId = normalizeAgentId(payload.agentId);
  const preview = summarizeObject(payload.result ?? payload.arguments, 120) ?? undefined;

  const invocationIndex = next.toolInvocations.findIndex((node) => node.id === normalizedId);
  const existing = invocationIndex >= 0 ? (next.toolInvocations[invocationIndex] as InternalToolNode) : null;

  const baseNode: InternalToolNode = existing
    ? { ...existing }
    : {
      id: normalizedId,
      name: payload.name ?? existing?.name ?? 'tool',
      status: status,
      metadata: { agentId: agentId ?? undefined },
      args: payload.arguments,
      result: payload.result,
      children: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

  if (!existing) {
    next.toolInvocations.push(baseNode);
  }

  const node = existing ? Object.assign(baseNode, { status: status }) : baseNode;

  if (payload.name) {
    node.name = payload.name;
  }
  if (payload.arguments !== undefined) {
    node.args = payload.arguments;
  }
  if (payload.result !== undefined) {
    node.result = payload.result;
  }
  node.status = status;
  node.updatedAt = timestamp;
  node.metadata = {
    ...(node.metadata ?? {}),
    agentId: agentId ?? (node.metadata?.agentId ?? 'unknown'),
    toolCallId: normalizedId,
    ...(preview ? { preview } : {}),
    createdAt: node.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  next.toolInvocations[invocationIndex >= 0 ? invocationIndex : next.toolInvocations.length - 1] = node;

  if (type === 'tool.result') {
    const spawnDetails = extractSpawnDetails(payload);
    if (spawnDetails) {
      upsertSpawnedAgent(next.agentHierarchy, agentId, spawnDetails);
      if (spawnDetails.contextBundles.length > 0) {
        mergeContextBundles(next.contextBundles, spawnDetails.contextBundles);
      }
    }
  }

  return next;
}

function cloneToolInvocation(node: ExecutionTreeState['toolInvocations'][number]): InternalToolNode {
  return {
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: node.children ? node.children.map(cloneToolInvocation) : [],
  };
}

function cloneAgentNode(node: ExecutionTreeState['agentHierarchy'][number]): InternalAgentNode {
  return {
    ...node,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: node.children ? node.children.map(cloneAgentNode) : [],
  };
}

function cloneContextBundles(
  bundles: ExecutionTreeState['contextBundles'],
): ExecutionTreeState['contextBundles'] {
  return bundles.map(cloneContextBundle);
}

function cloneContextBundle(
  bundle: ExecutionTreeState['contextBundles'][number],
): ExecutionTreeState['contextBundles'][number] {
  return {
    ...bundle,
    metadata: bundle.metadata ? { ...bundle.metadata } : undefined,
    files: bundle.files ? bundle.files.map((file) => ({ ...file })) : undefined,
  };
}

function normalizeToolInvocationId(payload: ToolSocketPayload, sessionId: string): string {
  const rawId = typeof payload.id === 'string' ? payload.id.trim() : '';
  if (rawId) {
    return rawId;
  }

  const name = typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name.trim() : 'tool';
  const timestamp = normalizeTimestamp(payload.timestamp);
  return `${sessionId}:${name}:${timestamp}`;
}

function normalizeTimestamp(value: string | null | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return new Date().toISOString();
  }

  return new Date(parsed).toISOString();
}

function resolveStatus(type: ToolSocketEventType, result: unknown): ToolCallStatusDto {
  if (type === 'tool.call') {
    return 'pending';
  }

  if (result && typeof result === 'object') {
    const statusValue = (result as { status?: unknown }).status;
    if (statusValue === 'failed') {
      return 'failed';
    }
    const success = (result as { success?: unknown }).success;
    if (success === false) {
      return 'failed';
    }
    if (statusValue === 'running') {
      return 'running';
    }
  }

  return 'completed';
}

function normalizeAgentId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return value ?? null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const SPAWN_RESULT_SCHEMA = 'eddie.tool.spawn_subagent.result.v1' as const;

interface SpawnDetails {
  agentId: string;
  provider?: string;
  model?: string;
  name?: string;
  metadata: Record<string, unknown>;
  messageCount?: number;
  contextBundleIds: string[];
  contextBundles: ExecutionTreeState['contextBundles'];
}

function extractSpawnDetails(payload: ToolSocketPayload): SpawnDetails | null {
  if (payload.name !== 'spawn_subagent') {
    return null;
  }

  const result = payload.result;
  if (!result || typeof result !== 'object') {
    return null;
  }

  const schema = (result as { schema?: unknown }).schema;
  if (schema !== SPAWN_RESULT_SCHEMA) {
    return null;
  }

  const rawMetadata = (result as { metadata?: unknown }).metadata;
  if (!rawMetadata || typeof rawMetadata !== 'object') {
    return null;
  }

  const metadataRecord = rawMetadata as Record<string, unknown>;
  const rawAgentId = metadataRecord.agentId;
  if (typeof rawAgentId !== 'string' || rawAgentId.trim().length === 0) {
    return null;
  }

  const provider = typeof metadataRecord.provider === 'string' ? metadataRecord.provider : undefined;
  const model = typeof metadataRecord.model === 'string' ? metadataRecord.model : undefined;
  const name = typeof metadataRecord.name === 'string' ? metadataRecord.name : undefined;

  const contextBundleIds = Array.isArray(metadataRecord.contextBundleIds)
    ? (metadataRecord.contextBundleIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];

  const spawnMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadataRecord)) {
    if (key === 'agentId' || key === 'provider' || key === 'model' || key === 'name' || key === 'contextBundleIds') {
      continue;
    }
    spawnMetadata[key] = value;
  }

  const rawData = (result as { data?: unknown }).data;
  const contextBundles: ExecutionTreeState['contextBundles'] = [];
  let messageCount: number | undefined;

  if (rawData && typeof rawData === 'object') {
    for (const [key, value] of Object.entries(rawData as Record<string, unknown>)) {
      if (key === 'contextBundles') {
        if (Array.isArray(value)) {
          for (const entry of value) {
            const bundle = coerceContextBundle(entry);
            if (bundle) {
              contextBundles.push(bundle);
            }
          }
        }
        continue;
      }

      spawnMetadata[key] = value;
      if (key === 'messageCount' && typeof value === 'number') {
        messageCount = value;
      }
    }
  }

  if (messageCount === undefined && typeof spawnMetadata.messageCount === 'number') {
    messageCount = spawnMetadata.messageCount as number;
  }

  return {
    agentId: rawAgentId.trim(),
    provider,
    model,
    name,
    metadata: spawnMetadata,
    messageCount,
    contextBundleIds,
    contextBundles,
  };
}

function coerceContextBundle(entry: unknown): ExecutionTreeState['contextBundles'][number] | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : null;
  if (!id) {
    return null;
  }

  const title = typeof record.title === 'string' ? record.title : id;
  const source = typeof record.source === 'string' ? record.source : 'spawn_subagent';

  const metadata = record.metadata && typeof record.metadata === 'object'
    ? { ...(record.metadata as Record<string, unknown>) }
    : undefined;

  return cloneContextBundle({
    id,
    title,
    source,
    metadata,
    files: undefined,
  });
}

function upsertSpawnedAgent(
  hierarchy: ExecutionTreeState['agentHierarchy'],
  parentAgentId: string | null,
  details: SpawnDetails,
): void {
  const parent = parentAgentId ? findAgentNode(hierarchy, parentAgentId) : hierarchy[0] ?? null;
  if (!parent) {
    hierarchy.push({
      id: details.agentId,
      name: details.name ?? details.agentId,
      provider: details.provider,
      model: details.model,
      depth: 0,
      metadata: buildSpawnMetadata({}, details),
      children: [],
    });
    return;
  }

  parent.children = parent.children ? [...parent.children] : [];
  const depth = (parent.depth ?? 0) + 1;
  const existingIndex = parent.children.findIndex((child) => child.id === details.agentId);
  const baseChild = existingIndex >= 0 ? { ...parent.children[existingIndex]! } : {
    id: details.agentId,
    name: details.name ?? details.agentId,
    provider: details.provider,
    model: details.model,
    depth,
    metadata: {},
    children: [],
  };

  const nextMetadata = buildSpawnMetadata(baseChild.metadata ?? {}, details);

  const nextChild: InternalAgentNode = {
    ...baseChild,
    name: details.name ?? baseChild.name ?? details.agentId,
    provider: details.provider ?? baseChild.provider,
    model: details.model ?? baseChild.model,
    depth,
    metadata: nextMetadata,
    children: baseChild.children ? [...baseChild.children] : [],
  };

  if (existingIndex >= 0) {
    parent.children[existingIndex] = nextChild;
  } else {
    parent.children.push(nextChild);
  }
}

function buildSpawnMetadata(
  existing: Record<string, unknown>,
  details: SpawnDetails,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...existing, ...details.metadata };
  if (details.messageCount !== undefined) {
    metadata.messageCount = details.messageCount;
  }
  if (details.contextBundleIds.length > 0) {
    const existingIds = Array.isArray(metadata.contextBundleIds)
      ? (metadata.contextBundleIds as unknown[]).filter((id): id is string => typeof id === 'string')
      : [];
    metadata.contextBundleIds = Array.from(new Set([...existingIds, ...details.contextBundleIds]));
  }
  return metadata;
}

function mergeContextBundles(
  current: ExecutionTreeState['contextBundles'],
  updates: ExecutionTreeState['contextBundles'],
): void {
  for (const update of updates) {
    const existingIndex = current.findIndex((bundle) => bundle.id === update.id);
    if (existingIndex >= 0) {
      const existing = current[existingIndex]!;
      current[existingIndex] = {
        ...existing,
        ...update,
        metadata: {
          ...(existing.metadata ?? {}),
          ...(update.metadata ?? {}),
        },
        files: update.files
          ? update.files.map((file) => ({ ...file }))
          : existing.files
            ? existing.files.map((file) => ({ ...file }))
            : undefined,
      };
    } else {
      current.push(cloneContextBundle(update));
    }
  }
}

function findAgentNode(
  nodes: ExecutionTreeState['agentHierarchy'],
  agentId: string,
): InternalAgentNode | null {
  for (const node of nodes) {
    if (node.id === agentId) {
      return node;
    }
    const child = node.children ? findAgentNode(node.children, agentId) : null;
    if (child) {
      return child;
    }
  }
  return null;
}
