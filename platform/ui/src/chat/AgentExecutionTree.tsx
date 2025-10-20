import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import { ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';

import { JsonTreeView, cn } from '../common';

import { summarizeObject } from './utils';
import type {
  ExecutionAgentHierarchyNode,
  ExecutionContextBundle,
  ExecutionToolInvocationNode,
  ExecutionTreeState,
  ToolCallStatus,
} from './types';

const TOOL_STATUS_ORDER: ToolCallStatus[] = ['pending', 'running', 'completed', 'failed'];
const TOOL_STATUS_LABELS: Record<ToolCallStatus, string> = {
  pending: 'Pending tool invocations',
  running: 'Running tool invocations',
  completed: 'Completed tool invocations',
  failed: 'Failed tool invocations',
};

const TOOL_STATUS_BADGE: Record<ToolCallStatus, 'gray' | 'blue' | 'green' | 'red'> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
};

const EMPTY_AGENT_HIERARCHY = [] as ExecutionTreeState['agentHierarchy'];
const EMPTY_TOOL_INVOCATIONS = [] as ExecutionTreeState['toolInvocations'];
const EMPTY_CONTEXT_BUNDLES = [] as ExecutionTreeState['contextBundles'];
const EMPTY_CONTEXT_BUNDLES_BY_AGENT = {} as ExecutionTreeState['contextBundlesByAgentId'];
const EMPTY_TOOL_GROUPS = {} as ExecutionTreeState['toolGroupsByAgentId'];
const EMPTY_AGENT_LINEAGE = {} as ExecutionTreeState['agentLineageById'];

const SECTION_TOGGLE_BUTTON_CLASS =
  'flex w-full items-center justify-between rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm transition hover:border-accent/50 hover:bg-slate-900/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const TOOL_PREVIEW_LIMIT = 120;

const TOOL_DETAILS_BUTTON_CLASS =
  'inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/5 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const TRANSITION_REGION_CLASS = 'transition-all duration-300 ease-out';

const EXPANSION_VARIANTS = {
  open: {
    opacity: 1,
    height: 'auto',
    marginTop: 8,
  },
  collapsed: {
    opacity: 0,
    height: 0,
    marginTop: 0,
  },
} as const;

const EXPANSION_TRANSITION = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
} as const;

const EXPANSION_MOTION_PROPS = {
  initial: 'collapsed',
  animate: 'open',
  exit: 'collapsed',
  variants: EXPANSION_VARIANTS,
  transition: EXPANSION_TRANSITION,
  style: { overflow: 'hidden' },
} as const;

function formatContextSource(
  source: ExecutionContextBundle['source'],
): string {
  if (!source) {
    return 'Unknown source';
  }

  if (typeof source === 'string') {
    return source;
  }

  if (typeof source === 'object' && 'type' in source) {
    if ((source as { type: string }).type === 'tool_result') {
      return `Tool result from ${(source as { agentId?: string | null }).agentId ?? 'unknown agent'}`;
    }
    if ((source as { type: string }).type === 'session_file') {
      return `Session file ${'fileId' in source ? (source as { fileId?: string }).fileId : 'unknown'}`;
    }
    return (source as { type: string }).type;
  }

  try {
    return JSON.stringify(source);
  } catch (error) {
    return String(source);
  }
}

export interface AgentExecutionTreeProps {
  state: ExecutionTreeState | null | undefined;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  focusedInvocationId?: string | null;
  onFocusInvocation?: (invocationId: string | null) => void;
}

type ToolGroupKey = `${string}:${ToolCallStatus}`;

type DetailsTarget = {
  agentId: string;
  invocationId: string;
};

function findInvocationById(
  nodes: ExecutionToolInvocationNode[],
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

export function AgentExecutionTree({
  state,
  selectedAgentId,
  onSelectAgent,
  focusedInvocationId,
  onFocusInvocation,
}: AgentExecutionTreeProps): JSX.Element {
  const agentHierarchy = state?.agentHierarchy ?? EMPTY_AGENT_HIERARCHY;
  const toolInvocations = state?.toolInvocations ?? EMPTY_TOOL_INVOCATIONS;
  const contextBundles = state?.contextBundles ?? EMPTY_CONTEXT_BUNDLES;
  const contextBundlesByAgentId = state?.contextBundlesByAgentId ?? EMPTY_CONTEXT_BUNDLES_BY_AGENT;
  const toolGroupsByAgentId = state?.toolGroupsByAgentId ?? EMPTY_TOOL_GROUPS;
  const agentLineageById = state?.agentLineageById ?? EMPTY_AGENT_LINEAGE;

  const agentsById = useMemo(() => indexAgents(agentHierarchy), [agentHierarchy]);

  const [expandedAgentIds, setExpandedAgentIds] = useState<Set<string>>(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [detailsTarget, setDetailsTarget] = useState<DetailsTarget | null>(null);
  const expandableAgentsRef = useRef<Set<string>>(new Set());
  const hasAutoExpandedRef = useRef(false);

  useEffect(() => {
    if (hasAutoExpandedRef.current) {
      return;
    }

    if (expandedAgentIds.size > 0) {
      hasAutoExpandedRef.current = true;
      return;
    }

    if (agentHierarchy.length === 0) {
      return;
    }

    const autoExpanded = collectExpandableAgentIds(agentHierarchy);
    if (autoExpanded.size === 0) {
      hasAutoExpandedRef.current = true;
      return;
    }

    setExpandedAgentIds(autoExpanded);
    hasAutoExpandedRef.current = true;
  }, [agentHierarchy, expandedAgentIds]);

  useEffect(() => {
    const nodesWithChildren = new Set<string>();
    const stack = [...agentHierarchy];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }
      const children = node.children ?? [];
      if (children.length > 0) {
        nodesWithChildren.add(node.id);
        for (const child of children) {
          stack.push(child);
        }
      }
    }

    const previouslySeenAgents = expandableAgentsRef.current;
    const newlySeenAgents = [...nodesWithChildren].filter((id) => !previouslySeenAgents.has(id));
    expandableAgentsRef.current = nodesWithChildren;

    if (newlySeenAgents.length === 0) {
      return;
    }

    setExpandedAgentIds((previous) => {
      let changed = false;
      const next = new Set(previous);
      for (const id of newlySeenAgents) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [agentHierarchy]);

  useEffect(() => {
    if (!selectedAgentId) {
      return;
    }

    const lineage = new Set(agentLineageById[selectedAgentId] ?? []);
    if (lineage.size === 0) {
      return;
    }

    setExpandedAgentIds((previous) => {
      const next = new Set(previous);
      for (const id of next) {
        if (!lineage.has(id)) {
          next.delete(id);
        }
      }
      for (const id of lineage) {
        next.add(id);
      }
      return next;
    });
  }, [agentHierarchy, agentLineageById, selectedAgentId]);

  const agentsWithActivity = useMemo(
    () =>
      Object.entries(toolGroupsByAgentId).filter(([, groups]) =>
        TOOL_STATUS_ORDER.some((status) => (groups?.[status]?.length ?? 0) > 0),
      ),
    [toolGroupsByAgentId],
  );

  useEffect(() => {
    if (agentsWithActivity.length === 0) {
      return;
    }

    setExpandedAgentIds((previous) => {
      let changed = false;
      const next = new Set(previous);
      for (const [agentId] of agentsWithActivity) {
        const lineage = agentLineageById[agentId];
        if (!lineage || lineage.length === 0) {
          continue;
        }
        for (const id of lineage) {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        }
      }
      return changed ? next : previous;
    });
  }, [agentLineageById, agentsWithActivity]);

  useEffect(() => {
    if (!focusedInvocationId) {
      setDetailsTarget(null);
      return;
    }

    const invocation = findInvocationById(toolInvocations, focusedInvocationId);
    if (!invocation) {
      return;
    }

    const agentId = invocation.agentId ?? null;
    if (agentId) {
      const lineage = agentLineageById[agentId] ?? [];
      setExpandedAgentIds((previous) => {
        const next = new Set(previous);
        for (const id of lineage) {
          next.add(id);
        }
        next.add(agentId);
        return next;
      });

      const statusKey: ToolGroupKey = `${agentId}:${invocation.status ?? 'pending'}`;
      setExpandedGroups((previous) => {
        const next = new Set(previous);
        next.add(statusKey);
        return next;
      });
    }

    setDetailsTarget({
      agentId: agentId ?? invocation.agentId ?? 'unknown',
      invocationId: focusedInvocationId,
    });
  }, [agentLineageById, focusedInvocationId, toolInvocations]);

  const handleSelectAgent = useCallback(
    (agentId: string) => {
      const nextSelection = agentId === selectedAgentId ? null : agentId;
      onSelectAgent(nextSelection);
    },
    [onSelectAgent, selectedAgentId],
  );

  const handleToggleGroup = useCallback((key: ToolGroupKey | string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleToggleAgent = useCallback((agentId: string) => {
    setExpandedAgentIds((previous) => {
      const next = new Set(previous);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  const detailsInvocation = detailsTarget
    ? findInvocationById(toolInvocations, detailsTarget.invocationId)
    : null;
  const detailsAgent = detailsTarget ? agentsById.get(detailsTarget.agentId) ?? null : null;
  const detailsContextBundles = detailsInvocation
    ? contextBundlesByAgentId[detailsTarget?.agentId ?? ''] ?? []
    : [];

  return (
    <>
      <Flex direction={{ initial: 'column', md: 'row' }} gap="4">
        <Box className="flex-1 space-y-3">
          {agentHierarchy.length === 0 ? (
            <Text size="2" color="gray">
              No agents in the execution tree yet. Start a run to populate the hierarchy.
            </Text>
          ) : (
            agentHierarchy.map((agent) => (
              <AgentNode
                key={agent.id}
                agent={agent}
                selectedAgentId={selectedAgentId}
                onSelectAgent={handleSelectAgent}
                expandedAgentIds={expandedAgentIds}
                onToggleAgent={handleToggleAgent}
                renderToolGroups={renderToolGroups}
                renderContextBundles={renderContextBundles}
              />
            ))
          )}
        </Box>
      </Flex>

      <Dialog.Root open={Boolean(detailsInvocation)} onOpenChange={(open) => {
        if (!open) {
          setDetailsTarget(null);
          onFocusInvocation?.(null);
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[85vh] w-[min(90vw,560px)] -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-left shadow-2xl">
            {detailsInvocation ? (
              <>
                <div className="space-y-1">
                  <Dialog.Title className="font-mono text-base">Tool invocation details</Dialog.Title>
                  <Dialog.Description>
                    {detailsInvocation.name ?? 'Tool invocation'} • Status {detailsInvocation.status}
                  </Dialog.Description>
                </div>
                {detailsContextBundles.length > 0 ? (
                  <Box className="space-y-2 text-left text-sm text-white/80">
                    {detailsContextBundles.map((bundle) => (
                      <Box key={bundle.id} className="space-y-1">
                        <Text weight="medium" className="text-white/90">
                          {bundle.title}
                        </Text>
                        {bundle.files && bundle.files.length > 0 ? (
                          <ul className="ml-4 list-disc space-y-1">
                            {bundle.files.map((file) => (
                              <li key={file.id}>{file.name}</li>
                            ))}
                          </ul>
                        ) : null}
                      </Box>
                    ))}
                  </Box>
                ) : null}
                <Box className="space-y-3 text-left">
                  <JsonTreeView
                    value={{
                      agent: detailsAgent ?? undefined,
                      invocation: detailsInvocation as unknown,
                      contextBundles: detailsContextBundles as unknown,
                    }}
                    className="text-left"
                  />
                </Box>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );

  function renderToolGroups(agent: ExecutionAgentHierarchyNode): JSX.Element | null {
    const groups = toolGroupsByAgentId[agent.id];
    if (!groups) {
      return null;
    }

    return (
      <Box className="space-y-2">
        {TOOL_STATUS_ORDER.map((status) => {
          const entries = groups[status];
          if (!entries || entries.length === 0) {
            return null;
          }

          const orderedEntries = [...entries].sort(
            (a, b) => resolveInvocationTimestamp(b) - resolveInvocationTimestamp(a),
          );

          const key: ToolGroupKey = `${agent.id}:${status}`;
          const isExpanded = expandedGroups.has(key);
          const regionId = `${key}:region`;
          return (
            <Box key={key}>
              <button
                type="button"
                className={SECTION_TOGGLE_BUTTON_CLASS}
                onClick={() => handleToggleGroup(key)}
                aria-expanded={isExpanded}
                aria-controls={regionId}
                aria-label={`Toggle ${TOOL_STATUS_LABELS[status].toLowerCase()} for ${agent.name}`}
              >
                <Flex align="center" gap="2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  )}
                  <Text className="text-white/90">{TOOL_STATUS_LABELS[status]}</Text>
                </Flex>
                <Badge color={TOOL_STATUS_BADGE[status]} variant="soft">
                  {entries.length}
                </Badge>
              </button>

              <AnimatePresence initial={false}>
                {isExpanded ? (
                  <motion.div
                    key={`${key}:content`}
                    className="mt-2"
                    {...EXPANSION_MOTION_PROPS}
                  >
                    <Box
                      role="region"
                      id={regionId}
                      aria-label={`${TOOL_STATUS_LABELS[status].toLowerCase()} for ${agent.name}`}
                      className={cn(
                        'rounded-lg border border-white/10 bg-slate-950/70',
                        TRANSITION_REGION_CLASS,
                      )}
                    >
                      <ul
                        data-testid="agent-execution-tree-tool-group-motion"
                        data-motion="agent-execution-tree-tool-group"
                        className="divide-y divide-white/5"
                      >
                        {orderedEntries.map((entry) => {
                          const metadataInspector = renderInvocationMetadata(entry);
                          return (
                            <li
                              key={entry.id}
                              className={cn('p-3 space-y-3', TRANSITION_REGION_CLASS)}
                            >
                              <Flex align="center" justify="between" gap="3">
                                <Box className="min-w-0">
                                  <Text weight="medium" className="truncate text-white/90">
                                    {entry.name ?? 'Unnamed invocation'}
                                  </Text>
                                  <Text size="1" color="gray" className="mt-1 block">
                                    {summarizeObject(
                                      resolveInvocationPreviewSource(status, entry),
                                      TOOL_PREVIEW_LIMIT,
                                    ) ??
                                      'No preview available'}
                                  </Text>
                                </Box>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDetailsTarget({ agentId: agent.id, invocationId: entry.id });
                                    onFocusInvocation?.(entry.id);
                                  }}
                                  className={TOOL_DETAILS_BUTTON_CLASS}
                                  aria-label="View full tool invocation details"
                                >
                                  View details
                                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                              </Flex>
                              {metadataInspector}
                            </li>
                          );
                        })}
                      </ul>
                    </Box>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </Box>
          );
        })}
      </Box>
    );
  }

  function renderContextBundles(_agent: ExecutionAgentHierarchyNode): JSX.Element | null {
    const bundles = contextBundlesByAgentId[_agent.id] ?? [];
    if (bundles.length === 0) {
      return null;
    }

    const key = `context:${_agent.id}`;
    const isExpanded = expandedGroups.has(key);
    const regionId = `${key}:region`;

    return (
      <Box>
        <button
          type="button"
          className={SECTION_TOGGLE_BUTTON_CLASS}
          onClick={() => handleToggleGroup(key)}
          aria-expanded={isExpanded}
          aria-controls={regionId}
          aria-label={`Toggle context bundles for ${_agent.name}`}
        >
          <Flex align="center" gap="2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
            <Text className="text-white/90">Context bundles</Text>
          </Flex>
          <Badge variant="soft" color="blue">
            {bundles.length}
          </Badge>
        </button>

        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              key={`${key}:content`}
              className="mt-2"
              {...EXPANSION_MOTION_PROPS}
            >
              <Box
                role="region"
                id={regionId}
                aria-label={`context bundles for ${_agent.name}`}
                className={cn(
                  'space-y-2 rounded-lg border border-white/10 bg-slate-950/70 p-3',
                  TRANSITION_REGION_CLASS,
                )}
              >
                {bundles.map((bundle, index) => (
                  <Box
                    key={bundle.id}
                    className="space-y-1"
                    data-testid={
                      index === 0 ? 'agent-execution-tree-context-motion' : undefined
                    }
                    data-motion={
                      index === 0 ? 'agent-execution-tree-context' : undefined
                    }
                  >
                    <Text weight="medium" className="text-white/90">
                      {bundle.title}
                    </Text>
                    <Text size="1" color="gray">
                      {formatContextSource(bundle.source)}
                    </Text>
                    {bundle.metadata ? (
                      <JsonTreeView
                        value={bundle.metadata}
                        collapsedByDefault
                        rootLabel="Bundle metadata"
                        className="text-left text-xs"
                      />
                    ) : null}
                  </Box>
                ))}
              </Box>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Box>
    );
  }
}

interface AgentNodeProps {
  agent: ExecutionAgentHierarchyNode;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  expandedAgentIds: Set<string>;
  onToggleAgent: (agentId: string) => void;
  renderToolGroups: (agent: ExecutionAgentHierarchyNode) => JSX.Element | null;
  renderContextBundles: (agent: ExecutionAgentHierarchyNode) => JSX.Element | null;
}

function AgentNode({
  agent,
  selectedAgentId,
  onSelectAgent,
  expandedAgentIds,
  onToggleAgent,
  renderToolGroups,
  renderContextBundles,
}: AgentNodeProps): JSX.Element {
  const childNodes = agent.children ?? [];
  const hasChildren = childNodes.length > 0;
  const isExpanded = expandedAgentIds.has(agent.id);
  const isSelected = selectedAgentId === agent.id;
  const accessibleName = agent.name ?? 'Agent';
  const displayName = agent.name ?? 'Unnamed agent';
  const toggleLabel = `${isExpanded ? 'Collapse' : 'Expand'} ${accessibleName}`;
  const selectLabel = `Select ${accessibleName}`;

  return (
    <Box
      data-agent-id={agent.id}
      className={cn(
        'space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4',
        isSelected ? 'border-accent/60 shadow-[0_0_0_1px_rgba(99,102,241,0.35)]' : undefined,
      )}
    >
      <Flex align="center" justify="between" gap="3" className="flex-wrap">
        <Flex align="center" gap="2" className="min-w-0 flex-1">
          {hasChildren ? (
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/10 p-1 text-white/80 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={() => onToggleAgent(agent.id)}
              aria-expanded={isExpanded}
              aria-label={toggleLabel}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="h-5 w-5" aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={() => onSelectAgent(agent.id)}
            aria-pressed={isSelected}
            aria-label={selectLabel}
            className={cn(
              'flex flex-1 flex-col items-start gap-1 overflow-hidden text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              isSelected ? 'text-accent-foreground' : 'text-white',
            )}
          >
            <Text size="2" weight="medium" className="truncate text-inherit">
              {displayName}
            </Text>
            {agent.role ? (
              <Text size="1" color="gray" className="truncate">
                {agent.role}
              </Text>
            ) : null}
          </button>
        </Flex>
        {agent.status ? (
          <Badge variant="soft" color="blue">
            {agent.status}
          </Badge>
        ) : null}
      </Flex>

      {renderToolGroups(agent)}
      {renderContextBundles(agent)}

      <AnimatePresence initial={false}>
        {hasChildren && isExpanded ? (
          <motion.div
            key={`${agent.id}:children`}
            className="pl-6"
            {...EXPANSION_MOTION_PROPS}
          >
            <Flex direction="column" gap="3">
              {childNodes.map((child) => (
                <AgentNode
                  key={child.id}
                  agent={child}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={onSelectAgent}
                  expandedAgentIds={expandedAgentIds}
                  onToggleAgent={onToggleAgent}
                  renderToolGroups={renderToolGroups}
                  renderContextBundles={renderContextBundles}
                />
              ))}
            </Flex>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Box>
  );
}

function renderInvocationMetadata(entry: ExecutionToolInvocationNode): JSX.Element | null {
  const metadata = entry.metadata as { args?: unknown; result?: unknown } | undefined;
  const inspectorValue: Record<string, unknown> = {};

  if (metadata && 'args' in metadata && metadata.args !== undefined) {
    inspectorValue.args = metadata.args;
  }

  if (metadata && 'result' in metadata && metadata.result !== undefined) {
    inspectorValue.result = metadata.result;
  }

  if (Object.keys(inspectorValue).length === 0) {
    return null;
  }

  return (
    <JsonTreeView
      value={inspectorValue}
      collapsedByDefault
      rootLabel="Invocation metadata"
      className="text-left text-xs"
    />
  );
}

function resolveInvocationPreviewSource(
  status: ToolCallStatus,
  entry: ExecutionToolInvocationNode,
): unknown {
  const isTerminal = status === 'completed' || status === 'failed';
  const metadata = entry.metadata as { args?: unknown; result?: unknown } | undefined;
  const candidates = isTerminal
    ? [entry.result, entry.args, metadata?.result, metadata?.args]
    : [entry.args, entry.result, metadata?.args, metadata?.result];

  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined) {
      return candidate;
    }
  }

  return null;
}

function resolveInvocationTimestamp(entry: ExecutionToolInvocationNode): number {
  const updated = entry.updatedAt ? Date.parse(entry.updatedAt) : Number.NaN;
  if (!Number.isNaN(updated)) {
    return updated;
  }

  const created = entry.createdAt ? Date.parse(entry.createdAt) : Number.NaN;
  if (!Number.isNaN(created)) {
    return created;
  }

  return Number.NEGATIVE_INFINITY;
}

function collectExpandableAgentIds(nodes: ExecutionAgentHierarchyNode[]): Set<string> {
  const ids = new Set<string>();
  const stack = [...nodes];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    const children = node.children ?? [];
    if (children.length > 0) {
      ids.add(node.id);
      for (const child of children) {
        stack.push(child);
      }
    }
  }

  return ids;
}

function indexAgents(
  nodes: ExecutionAgentHierarchyNode[],
): Map<string, ExecutionAgentHierarchyNode> {
  const map = new Map<string, ExecutionAgentHierarchyNode>();

  const visit = (node: ExecutionAgentHierarchyNode): void => {
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
