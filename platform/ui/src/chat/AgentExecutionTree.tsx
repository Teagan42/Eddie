import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import { ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import type { ToolCallStatusDto } from '@eddie/api-client';
import { summarizeObject } from './utils/chat-utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../vendor/components/ui/dialog';
import { JsonTreeView } from '@eddie/ui';
import { cn } from '../vendor/lib/utils';

import type { ExecutionTreeState } from '@eddie/types';

const TOOL_STATUS_ORDER: ToolCallStatusDto[] = ['pending', 'running', 'completed', 'failed'];
const TOOL_STATUS_LABELS: Record<ToolCallStatusDto, string> = {
  pending: 'Pending tool invocations',
  running: 'Running tool invocations',
  completed: 'Completed tool invocations',
  failed: 'Failed tool invocations',
};

const TOOL_STATUS_BADGE: Record<ToolCallStatusDto, 'gray' | 'blue' | 'green' | 'red'> = {
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

function collectSingleStatusGroupKeys(
  groupsByAgentId: ExecutionTreeState['toolGroupsByAgentId'],
): Set<ToolGroupKey> {
  const keys = new Set<ToolGroupKey>();
  for (const [agentId, groups] of Object.entries(groupsByAgentId)) {
    if (!groups) {
      continue;
    }

    const statusesWithEntries = TOOL_STATUS_ORDER.filter((status) =>
      status ? (groups?.[status]?.length ?? 0) > 0 : false,
    );

    if (statusesWithEntries.length === 1) {
      const status = statusesWithEntries[0]!;
      keys.add(`${agentId}:${status}` as ToolGroupKey);
    }
  }

  return keys;
}

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
  source: ExecutionTreeState['contextBundles'][number]['source'],
): string {
  if (!source) {
    return 'Unknown source';
  }

  if (typeof source === 'string') {
    return source;
  }

  if (typeof source === 'object' && 'type' in source) {
    if (source.type === 'tool_result') {
      return `Tool result from ${source.agentId ?? 'unknown agent'}`;
    }
    if ((source.type as string) === 'session_file') {
      return `Session file ${'fileId' in source ? source.fileId : 'unknown'}`;
    }
    return source.type;
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

type AgentHierarchyNode = ExecutionTreeState['agentHierarchy'][number];
type ToolInvocationNode = ExecutionTreeState['toolInvocations'][number];
type ToolGroupKey = `${string}:${ToolCallStatusDto}`;

type DetailsTarget = {
  agentId: string;
  invocationId: string;
};

function findInvocationById(
  nodes: ExecutionTreeState['toolInvocations'],
  id: string,
): ToolInvocationNode | null {
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
  const hasExpandedAgents = expandedAgentIds.size > 0;

  useEffect(() => {
    const autoExpandedKeys = collectSingleStatusGroupKeys(toolGroupsByAgentId);
    if (autoExpandedKeys.size === 0) {
      return;
    }

    setExpandedGroups((previous) => {
      let changed = false;
      const next = new Set(previous);
      for (const key of autoExpandedKeys) {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [toolGroupsByAgentId]);

  useEffect(() => {
    if (hasExpandedAgents) {
      return;
    }

    if (agentHierarchy.length === 0) {
      return;
    }

    const autoExpanded = collectExpandableAgentIds(agentHierarchy);
    if (autoExpanded.size === 0) {
      return;
    }

    setExpandedAgentIds(autoExpanded);
  }, [agentHierarchy, hasExpandedAgents]);

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
        TOOL_STATUS_ORDER.some((status: ToolCallStatusDto | undefined) => status &&(groups?.[status]?.length ?? 0) > 0),
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

      const statusKey: ToolGroupKey = `${agentId}:${invocation.status ?? 'pending'}` as ToolGroupKey;
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

  function renderToolGroups(agent: AgentHierarchyNode): JSX.Element | null {
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

  function renderContextBundles(_agent: AgentHierarchyNode): JSX.Element | null {
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
                        value={bundle.metadata as unknown}
                        collapsedByDefault
                        className="text-left text-xs"
                      />
                    ) : null}
                    {bundle.files && bundle.files.length > 0 ? (
                      <ul className="space-y-1 text-xs text-white/80">
                        {bundle.files.map((file) => (
                          <li key={file.id}>{file.name}</li>
                        ))}
                      </ul>
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

  function renderSubAgents(agent: AgentHierarchyNode): JSX.Element | null {
    if (!agent.children || agent.children.length === 0) {
      return null;
    }

    const key = agent.id;
    const isExpanded = expandedAgentIds.has(key);
    const regionId = `${key}:children`;

    return (
      <Box>
        <button
          type="button"
          className={SECTION_TOGGLE_BUTTON_CLASS}
          onClick={() => handleToggleAgent(key)}
          aria-expanded={isExpanded}
          aria-controls={regionId}
          aria-label={`Toggle spawned agents for ${agent.name}`}
        >
          <Flex align="center" gap="2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
            <Text className="text-white/90">Spawned agents</Text>
          </Flex>
          <Badge variant="soft" color="gray">
            {agent.children.length}
          </Badge>
        </button>

        {isExpanded ? (
          <Box
            role="region"
            id={regionId}
            aria-label={`spawned agents for ${agent.name}`}
            className={cn('mt-3 border-l border-dashed border-white/10 pl-3', TRANSITION_REGION_CLASS)}
          >
            {renderAgents(agent.children, (agent.depth ?? 0) + 1)}
          </Box>
        ) : null}
      </Box>
    );
  }

  function renderAgents(nodes: AgentHierarchyNode[], depth = 0): JSX.Element {
    if (nodes.length === 0) {
      return (
        <Text size="2" color="gray">
          Orchestrator has not spawned any agents yet.
        </Text>
      );
    }

    return (
      <ul className="space-y-3" data-depth={depth}>
        {nodes.map((node) => (
          <li
            key={node.id}
            className={cn(
              'rounded-2xl border border-white/10 bg-slate-950/60 p-4',
              TRANSITION_REGION_CLASS,
            )}
          >
            <Flex direction="column" gap="3">
              <button
                type="button"
                onClick={() => handleSelectAgent(node.id)}
                aria-pressed={node.id === selectedAgentId}
                aria-label={`Select ${node.name} agent`}
                className={cn(
                  'rounded-lg border border-transparent bg-slate-900/40 px-3 py-2 text-left transition hover:border-accent/50 hover:bg-slate-900/60',
                  selectedAgentId === node.id && 'border-accent/60 bg-accent/10',
                )}
              >
                <Flex align="center" justify="between" gap="3">
                  <Box>
                    <Text weight="medium" className="text-white">
                      {node.name}
                    </Text>
                    <Flex align="center" gap="2" className="mt-1">
                      <Badge variant="soft" color="blue">
                        {node.provider ?? 'Unknown provider'}
                      </Badge>
                      <Badge variant="soft" color="gray">
                        {node.model ?? 'Unknown model'}
                      </Badge>
                      {typeof node.depth === 'number' ? (
                        <Badge variant="soft" color="gray">
                          depth {node.depth}
                        </Badge>
                      ) : null}
                    </Flex>
                  </Box>
                  <Badge variant="soft" color="gray">
                    {typeof node.metadata?.messageCount === 'number'
                      ? `${node.metadata.messageCount} msgs`
                      : 'No messages'}
                  </Badge>
                </Flex>
              </button>

              {renderToolGroups(node)}
              {renderContextBundles(node)}
              {renderSubAgents(node)}
            </Flex>
          </li>
        ))}
      </ul>
    );
  }

  if (agentHierarchy.length === 0 && toolInvocations.length === 0) {
    return (
      <Text size="2" color="gray">
        No orchestrator activity recorded for this session yet.
      </Text>
    );
  }

  const detailsInvocation = detailsTarget
    ? toolInvocations.find((node) => node.id === detailsTarget.invocationId)
    : null;
  const detailsAgent = detailsTarget ? (agentsById.get(detailsTarget.agentId) ?? null) : null;

  return (
    <>
      {renderAgents(agentHierarchy)}
      <Dialog
        open={detailsTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsTarget(null);
            onFocusInvocation?.(null);
          }
        }}
      >
        {detailsInvocation ? (
          <DialogContent className="max-h-[85vh] space-y-4 overflow-y-auto">
            <DialogHeader className="text-left">
              <DialogTitle className="font-mono text-base">Tool invocation details</DialogTitle>
              <DialogDescription>
                {detailsInvocation.name ?? 'Tool invocation'} • Status {detailsInvocation.status}
              </DialogDescription>
            </DialogHeader>
            {contextBundles.length > 0 ? (
              <Box className="space-y-2 text-left text-sm text-white/80">
                {contextBundles.map((bundle) => (
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
                  contextBundles: contextBundles as unknown,
                }}
                className="text-left"
              />
            </Box>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

function renderInvocationMetadata(entry: ToolInvocationNode): JSX.Element | null {
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
  status: ToolCallStatusDto,
  entry: ToolInvocationNode,
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

function resolveInvocationTimestamp(entry: ToolInvocationNode): number {
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

function collectExpandableAgentIds(nodes: AgentHierarchyNode[]): Set<string> {
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
  nodes: ExecutionTreeState['agentHierarchy'],
): Map<string, AgentHierarchyNode> {
  const map = new Map<string, AgentHierarchyNode>();

  const visit = (node: AgentHierarchyNode): void => {
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
