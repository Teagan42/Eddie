import type {
  OrchestratorMetadataDto,
  OrchestratorToolCallNodeDto,
} from '@eddie/api-client';
import type {
  ExecutionAgentLineageMap,
  ExecutionContextBundle,
  ExecutionContextBundlesByAgentId,
  ExecutionContextBundlesByToolCallId,
  ExecutionToolInvocationGroupsByAgentId,
  ExecutionToolInvocationNode,
  ExecutionTreeState,
  ToolCallStatus,
} from '@eddie/types';

export interface ToolEventPayload {
  sessionId?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
  result?: unknown;
  timestamp?: string;
  agentId?: string | null;
}

const TOOL_STATUS_ORDER: ToolCallStatus[] = ['pending', 'running', 'completed', 'failed'];
const UNIX_EPOCH = new Date(0).toISOString();
const UNKNOWN_AGENT_ID = 'unknown';

type MutableToolInvocationNode = ExecutionToolInvocationNode & {
  args?: unknown;
  result?: unknown;
};

type DerivedExecutionTreeFields = Partial<
  Pick<
    ExecutionTreeState,
    | 'agentLineageById'
    | 'toolGroupsByAgentId'
    | 'contextBundlesByAgentId'
    | 'contextBundlesByToolCallId'
    | 'createdAt'
    | 'updatedAt'
  >
>;

export function createEmptyExecutionTreeState(): ExecutionTreeState {
  return composeExecutionTreeState([], [], [], {
    agentLineageById: {},
    toolGroupsByAgentId: {},
    contextBundlesByAgentId: {},
    contextBundlesByToolCallId: {},
    createdAt: UNIX_EPOCH,
    updatedAt: UNIX_EPOCH,
  });
}

export function createExecutionTreeStateFromMetadata(
  metadata: OrchestratorMetadataDto,
): ExecutionTreeState {
  const treeCandidate = (metadata as { executionTree?: ExecutionTreeState | null }).executionTree;
  if (isExecutionTreeState(treeCandidate)) {
    return cloneExecutionTreeState(treeCandidate);
  }

  const hierarchy = convertAgentHierarchy(metadata.agentHierarchy ?? []);
  const { invocations, toolGroups: inferredGroups } = convertToolInvocations(metadata.toolInvocations ?? []);
  const {
    bundles,
    byAgentId: inferredBundlesByAgent,
    byToolCallId: inferredBundlesByToolCall,
  } = convertContextBundles(metadata.contextBundles ?? []);

  return composeExecutionTreeState(hierarchy, invocations, bundles, {
    agentLineageById: buildAgentLineageMap(hierarchy),
    toolGroupsByAgentId: inferredGroups ?? groupToolInvocations(invocations),
    contextBundlesByAgentId: inferredBundlesByAgent,
    contextBundlesByToolCallId: inferredBundlesByToolCall,
    createdAt: metadata.capturedAt ?? UNIX_EPOCH,
    updatedAt: metadata.capturedAt ?? UNIX_EPOCH,
  });
}

export function cloneExecutionTreeState(state: ExecutionTreeState): ExecutionTreeState {
  const clonedToolInvocations = cloneToolInvocations(state.toolInvocations);
  const toolInvocationLookup = indexToolInvocationsById(clonedToolInvocations);

  return composeExecutionTreeState(
    cloneAgentHierarchy(state.agentHierarchy),
    clonedToolInvocations,
    cloneContextBundles(state.contextBundles),
    {
      agentLineageById: cloneAgentLineageMap(state.agentLineageById),
      toolGroupsByAgentId: cloneToolGroupsByAgentId(
        state.toolGroupsByAgentId,
        toolInvocationLookup,
      ),
      contextBundlesByAgentId: cloneBundlesByAgentId(state.contextBundlesByAgentId),
      contextBundlesByToolCallId: cloneBundlesByToolCallId(state.contextBundlesByToolCallId),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    },
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
  const mutableTarget = target as MutableToolInvocationNode;
  target.name = typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name : target.name;
  target.status = 'running';
  target.agentId = normalizeAgentId(payload.agentId) ?? target.agentId ?? UNKNOWN_AGENT_ID;
  const parsedArgs = parseEventValue(payload.arguments);
  target.metadata = {
    ...(target.metadata ?? {}),
    args: parsedArgs,
  };
  mutableTarget.args = parsedArgs;
  if (payload.timestamp) {
    target.updatedAt = payload.timestamp;
    target.createdAt = target.createdAt ?? payload.timestamp;
    next.updatedAt = payload.timestamp;
    next.createdAt = next.createdAt ?? payload.timestamp;
  }

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
  const mutableTarget = target as MutableToolInvocationNode;
  target.name = typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name : target.name;
  target.status = 'completed';
  const parsedResult = parseEventValue(payload.result);
  target.metadata = {
    ...(target.metadata ?? {}),
    result: parsedResult,
  };
  mutableTarget.result = parsedResult;
  target.agentId = normalizeAgentId(payload.agentId) ?? target.agentId ?? UNKNOWN_AGENT_ID;
  if (payload.timestamp) {
    target.updatedAt = payload.timestamp;
    next.updatedAt = payload.timestamp;
    next.createdAt = next.createdAt ?? payload.timestamp;
  }

  return rebuildDerivedState(next);
}

function rebuildDerivedState(state: ExecutionTreeState): ExecutionTreeState {
  return composeExecutionTreeState(
    state.agentHierarchy,
    state.toolInvocations,
    state.contextBundles,
    {
      agentLineageById: state.agentLineageById,
      toolGroupsByAgentId: groupToolInvocations(state.toolInvocations),
      contextBundlesByAgentId: state.contextBundlesByAgentId,
      contextBundlesByToolCallId: state.contextBundlesByToolCallId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    },
  );
}

export function composeExecutionTreeState(
  hierarchy: ExecutionTreeState['agentHierarchy'],
  toolInvocations: ExecutionTreeState['toolInvocations'],
  contextBundles: ExecutionTreeState['contextBundles'],
  derived?: DerivedExecutionTreeFields,
): ExecutionTreeState {
  const agentLineageById = derived?.agentLineageById ?? buildAgentLineageMap(hierarchy);
  const toolInvocationLookup = derived?.toolGroupsByAgentId
    ? indexToolInvocationsById(toolInvocations)
    : null;
  const toolGroupsByAgentId = derived?.toolGroupsByAgentId
    ? cloneToolGroupsByAgentId(derived.toolGroupsByAgentId, toolInvocationLookup ?? undefined)
    : groupToolInvocations(toolInvocations);
  const contextBundlesByAgentId = derived?.contextBundlesByAgentId
    ? cloneBundlesByAgentId(derived.contextBundlesByAgentId)
    : groupContextBundlesByAgentId(contextBundles);
  const contextBundlesByToolCallId = derived?.contextBundlesByToolCallId
    ? cloneBundlesByToolCallId(derived.contextBundlesByToolCallId)
    : groupContextBundlesByToolCallId(contextBundles);
  const createdAt = derived?.createdAt ?? UNIX_EPOCH;
  const updatedAt = derived?.updatedAt ?? createdAt;

  return {
    agentHierarchy: hierarchy,
    toolInvocations,
    contextBundles,
    agentLineageById,
    toolGroupsByAgentId,
    contextBundlesByAgentId,
    contextBundlesByToolCallId,
    createdAt,
    updatedAt,
  };
}

export function isExecutionTreeState(value: unknown): value is ExecutionTreeState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as ExecutionTreeState;
  return Array.isArray(candidate.agentHierarchy) && Array.isArray(candidate.toolInvocations);
}

function convertAgentHierarchy(
  nodes: OrchestratorMetadataDto['agentHierarchy'],
): ExecutionTreeState['agentHierarchy'] {
  const visit = (
    node: OrchestratorMetadataDto['agentHierarchy'][number],
    lineage: string[],
  ): ExecutionTreeState['agentHierarchy'][number] => ({
    id: node.id,
    name: node.name,
    provider: node.provider,
    model: node.model,
    depth: node.depth ?? lineage.length,
    lineage: [...lineage, node.id],
    children: (node.children ?? []).map((child) => visit(child, [...lineage, node.id])),
  });

  return nodes.map((node) => visit(node, []));
}

function convertToolInvocations(
  nodes: OrchestratorMetadataDto['toolInvocations'],
): {
  invocations: ExecutionTreeState['toolInvocations'];
  toolGroups: ExecutionToolInvocationGroupsByAgentId | null;
} {
  if (!nodes || nodes.length === 0) {
    return { invocations: [], toolGroups: null };
  }

  const invocations = nodes.map((node) => normalizeInvocationNode(node));
  return { invocations, toolGroups: groupToolInvocations(invocations) };
}

function convertContextBundles(
  bundles: OrchestratorMetadataDto['contextBundles'],
): {
  bundles: ExecutionContextBundle[];
  byAgentId: ExecutionContextBundlesByAgentId;
  byToolCallId: ExecutionContextBundlesByToolCallId;
} {
  const converted = bundles.map((bundle) => ({
    id: bundle.id,
    label: bundle.label,
    summary: bundle.summary,
    sizeBytes: bundle.sizeBytes,
    fileCount: bundle.fileCount,
    files: normalizeContextBundleFiles(bundle.files),
    source: {
      type: 'tool_call',
      agentId: UNKNOWN_AGENT_ID,
      toolCallId: bundle.id,
    },
  } satisfies ExecutionContextBundle));

  return {
    bundles: converted,
    byAgentId: groupContextBundlesByAgentId(converted),
    byToolCallId: groupContextBundlesByToolCallId(converted),
  };
}

function cloneAgentHierarchy(nodes: ExecutionTreeState['agentHierarchy']): ExecutionTreeState['agentHierarchy'] {
  return nodes.map((node) => ({
    ...node,
    lineage: [...node.lineage],
    children: cloneAgentHierarchy(node.children ?? []),
  }));
}

function cloneToolInvocations(
  nodes: ExecutionTreeState['toolInvocations'],
): ExecutionTreeState['toolInvocations'] {
  return nodes.map((node) => {
    const descriptors = Object.getOwnPropertyDescriptors(node);
    const metadataClone = node.metadata ? { ...node.metadata } : undefined;
    descriptors.metadata = {
      value: metadataClone,
      writable: true,
      enumerable: true,
      configurable: true,
    };
    descriptors.children = {
      value: cloneToolInvocations(node.children ?? []),
      writable: true,
      enumerable: true,
      configurable: true,
    };
    if (!descriptors.args) {
      descriptors.args = {
        value: (metadataClone as { args?: unknown } | undefined)?.args,
        writable: true,
        enumerable: true,
        configurable: true,
      };
    }
    if (!descriptors.result) {
      descriptors.result = {
        value: (metadataClone as { result?: unknown } | undefined)?.result,
        writable: true,
        enumerable: true,
        configurable: true,
      };
    }

    return Object.defineProperties({}, descriptors) as ExecutionToolInvocationNode;
  });
}

function indexToolInvocationsById(
  nodes: ExecutionTreeState['toolInvocations'],
  lookup: Map<string, ExecutionToolInvocationNode> = new Map(),
): Map<string, ExecutionToolInvocationNode> {
  for (const node of nodes) {
    lookup.set(node.id, node);
    if (node.children?.length) {
      indexToolInvocationsById(node.children, lookup);
    }
  }
  return lookup;
}

function cloneContextBundles(bundles: ExecutionContextBundle[]): ExecutionContextBundle[] {
  return bundles.map((bundle) => cloneContextBundleEntry(bundle));
}

function cloneContextBundleEntry(bundle: ExecutionContextBundle): ExecutionContextBundle {
  const descriptors = Object.getOwnPropertyDescriptors(bundle);
  const clonedFiles = cloneContextBundleFiles(bundle.files);
  if (Array.isArray(clonedFiles)) {
    clonedFiles.forEach((file, index) => {
      const record = file as Record<string, unknown>;
      if (record.id == null) {
        Object.defineProperty(file, 'id', {
          value: `${bundle.id}:file:${index}`,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      if (record.name == null) {
        const fallbackName = typeof record.path === 'string' ? (record.path as string) : `File ${index + 1}`;
        Object.defineProperty(file, 'name', {
          value: fallbackName,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    });
  }
  descriptors.files = {
    value: clonedFiles,
    writable: true,
    enumerable: true,
    configurable: true,
  };
  descriptors.source = {
    value: normalizeContextBundleSource(bundle),
    writable: true,
    enumerable: true,
    configurable: true,
  };
  if (bundle.metadata !== undefined) {
    descriptors.metadata = {
      value: typeof bundle.metadata === 'object' && bundle.metadata !== null
        ? { ...(bundle.metadata as Record<string, unknown>) }
        : bundle.metadata,
      writable: true,
      enumerable: true,
      configurable: true,
    };
  }

  return Object.defineProperties({}, descriptors) as ExecutionContextBundle;
}

function cloneContextBundleFiles(
  files: ExecutionContextBundle['files'],
): ExecutionContextBundle['files'] {
  if (!Array.isArray(files)) {
    return files;
  }

  return files.map((file) => {
    const descriptors = Object.getOwnPropertyDescriptors(file);
    return Object.defineProperties({}, descriptors);
  });
}

function normalizeContextBundleFiles(
  files: ExecutionContextBundle['files'],
): ExecutionContextBundle['files'] {
  if (!Array.isArray(files)) {
    return files;
  }

  return files.map((file) => ({
    path: file.path,
    sizeBytes: file.sizeBytes,
    preview: file.preview,
  }));
}

function cloneAgentLineageMap(map: ExecutionAgentLineageMap): ExecutionAgentLineageMap {
  return Object.fromEntries(Object.entries(map).map(([key, lineage]) => [key, [...lineage]]));
}

function cloneToolGroupsByAgentId(
  groups: ExecutionToolInvocationGroupsByAgentId,
  lookup?: Map<string, ExecutionToolInvocationNode>,
): ExecutionToolInvocationGroupsByAgentId {
  const cloned: ExecutionToolInvocationGroupsByAgentId = {};
  for (const [agentId, statuses] of Object.entries(groups)) {
    cloned[agentId] = {} as ExecutionToolInvocationGroupsByAgentId[string];
    const agentGroups = cloned[agentId];
    for (const status of TOOL_STATUS_ORDER) {
      const entries = statuses[status];
      if (entries && entries.length > 0) {
        agentGroups[status] = entries
          .map((entry) => (lookup ? lookup.get(entry.id) ?? null : entry))
          .filter((entry): entry is ExecutionToolInvocationNode => entry !== null);
      }
    }
    for (const status of Object.keys(statuses) as ToolCallStatus[]) {
      if (agentGroups[status]) {
        continue;
      }
      const entries = statuses[status];
      if (entries && entries.length > 0) {
        agentGroups[status] = entries.map((entry) => (lookup ? lookup.get(entry.id) ?? entry : entry));
      }
    }
  }
  return cloned;
}

function cloneBundlesByAgentId(
  bundles: ExecutionContextBundlesByAgentId,
): ExecutionContextBundlesByAgentId {
  const cloned: ExecutionContextBundlesByAgentId = {};
  for (const [agentId, entries] of Object.entries(bundles)) {
    cloned[agentId] = cloneContextBundleCollection(entries);
  }
  return cloned;
}

function cloneBundlesByToolCallId(
  bundles: ExecutionContextBundlesByToolCallId,
): ExecutionContextBundlesByToolCallId {
  const cloned: ExecutionContextBundlesByToolCallId = {};
  for (const [toolCallId, entries] of Object.entries(bundles)) {
    cloned[toolCallId] = cloneContextBundleCollection(entries);
  }
  return cloned;
}

function cloneContextBundleCollection(entries: ExecutionContextBundle[]): ExecutionContextBundle[] {
  return entries.map((entry) => cloneContextBundleEntry(entry));
}

function normalizeInvocationNode(node: OrchestratorToolCallNodeDto): ExecutionToolInvocationNode {
  const children = (node.children ?? []).map((child) => normalizeInvocationNode(child));
  const normalizedAgentId = normalizeAgentId((node.metadata as { agentId?: string | null } | undefined)?.agentId);
  const metadataClone = node.metadata ? { ...node.metadata } : undefined;
  const normalized = {
    id: node.id,
    name: node.name,
    status: node.status as ToolCallStatus,
    agentId: normalizedAgentId ?? UNKNOWN_AGENT_ID,
    createdAt: (node.metadata as { createdAt?: string } | undefined)?.createdAt,
    updatedAt: (node.metadata as { updatedAt?: string } | undefined)?.updatedAt,
    metadata: metadataClone,
    children,
  } satisfies ExecutionToolInvocationNode;

  if (metadataClone && 'args' in metadataClone) {
    (normalized as MutableToolInvocationNode).args = (metadataClone as { args?: unknown }).args;
  }
  if (metadataClone && 'result' in metadataClone) {
    (normalized as MutableToolInvocationNode).result = (metadataClone as { result?: unknown }).result;
  }

  return normalized;
}

function ensureInvocation(
  list: ExecutionTreeState['toolInvocations'],
  id: string,
): ExecutionToolInvocationNode {
  const existing = findInvocationById(list, id);
  if (existing) {
    return existing;
  }

  const next: MutableToolInvocationNode = {
    id,
    name: 'tool',
    status: 'running',
    agentId: UNKNOWN_AGENT_ID,
    metadata: {},
    children: [],
  };
  list.push(next);
  return next;
}

function findInvocationById(
  nodes: ExecutionTreeState['toolInvocations'],
  id: string,
): ExecutionToolInvocationNode | null {
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
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildAgentLineageMap(
  nodes: ExecutionTreeState['agentHierarchy'],
): ExecutionAgentLineageMap {
  const map = new Map<string, string[]>();

  const visit = (node: ExecutionTreeState['agentHierarchy'][number]) => {
    map.set(node.id, [...node.lineage]);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return Object.fromEntries(map.entries());
}

function groupToolInvocations(
  nodes: ExecutionTreeState['toolInvocations'],
): ExecutionToolInvocationGroupsByAgentId {
  const grouped: ExecutionToolInvocationGroupsByAgentId = {};

  const visit = (node: ExecutionToolInvocationNode) => {
    const agentId = normalizeAgentId(node.agentId) ?? UNKNOWN_AGENT_ID;
    const status = node.status ?? 'pending';
    if (!grouped[agentId]) {
      grouped[agentId] = {} as ExecutionToolInvocationGroupsByAgentId[string];
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

function groupContextBundlesByAgentId(
  bundles: ExecutionContextBundle[],
): ExecutionContextBundlesByAgentId {
  const grouped: ExecutionContextBundlesByAgentId = {};
  for (const bundle of bundles) {
    const agentId = normalizeAgentId(bundle.source?.agentId) ?? UNKNOWN_AGENT_ID;
    const entries = grouped[agentId] ?? [];
    entries.push(bundle);
    grouped[agentId] = entries;
  }
  return grouped;
}

function groupContextBundlesByToolCallId(
  bundles: ExecutionContextBundle[],
): ExecutionContextBundlesByToolCallId {
  const grouped: ExecutionContextBundlesByToolCallId = {};
  for (const bundle of bundles) {
    const toolCallId = bundle.source?.toolCallId ?? bundle.id;
    const entries = grouped[toolCallId] ?? [];
    entries.push(bundle);
    grouped[toolCallId] = entries;
  }
  return grouped;
}

function normalizeContextBundleSource(bundle: ExecutionContextBundle): ExecutionContextBundle['source'] {
  if (bundle.source) {
    return { ...bundle.source };
  }

  return { type: 'tool_call', agentId: UNKNOWN_AGENT_ID, toolCallId: bundle.id };
}

function resolveTimestamp(node: ExecutionToolInvocationNode): number {
  const timestamp = node.updatedAt ?? node.createdAt ?? null;
  return timestamp ? Date.parse(timestamp) : 0;
}
