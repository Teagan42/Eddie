import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import { ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import type { OrchestratorMetadataDto, ToolCallStatusDto } from '@eddie/api-client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/vendor/components/ui/dialog';
import { JsonTreeView } from '@/components/common';
import { cn } from '@/vendor/lib/utils';

import { summarizeObject } from '../chat-utils';

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

const SECTION_TOGGLE_BUTTON_CLASS =
  'flex w-full items-center justify-between rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm transition hover:border-accent/50 hover:bg-slate-900/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const TOOL_PREVIEW_LIMIT = 120;

export interface AgentExecutionTreeProps {
  metadata: OrchestratorMetadataDto | null | undefined;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}

type AgentHierarchyNode = OrchestratorMetadataDto['agentHierarchy'][number];
type ToolInvocationNode = OrchestratorMetadataDto['toolInvocations'][number];
type ToolGroupKey = `${string}:${ToolCallStatusDto}`;

type DetailsTarget = {
  agentId: string;
  invocationId: string;
};

export function AgentExecutionTree({
  metadata,
  selectedAgentId,
  onSelectAgent,
}: AgentExecutionTreeProps): JSX.Element {
  const agentHierarchy = useMemo(
    () => metadata?.agentHierarchy ?? [],
    [metadata?.agentHierarchy],
  );
  const toolInvocations = useMemo(
    () => metadata?.toolInvocations ?? [],
    [metadata?.toolInvocations],
  );
  const contextBundles = useMemo(
    () => metadata?.contextBundles ?? [],
    [metadata?.contextBundles],
  );

  const agentsById = useMemo(() => indexAgents(agentHierarchy), [agentHierarchy]);
  const groupedToolInvocations = useMemo(
    () => groupToolInvocations(toolInvocations),
    [toolInvocations],
  );

  const [expandedAgentIds, setExpandedAgentIds] = useState<Set<string>>(() => new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [detailsTarget, setDetailsTarget] = useState<DetailsTarget | null>(null);

  useEffect(() => {
    if (!selectedAgentId) {
      return;
    }

    const lineage = collectAgentLineage(agentHierarchy, selectedAgentId);
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
  }, [agentHierarchy, selectedAgentId]);

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
    const groups = groupedToolInvocations.get(agent.id);
    if (!groups) {
      return null;
    }

    return (
      <Box className="space-y-2">
        {TOOL_STATUS_ORDER.map((status) => {
          const entries = groups.get(status);
          if (!entries || entries.length === 0) {
            return null;
          }

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

              {isExpanded ? (
                <Box
                  role="region"
                  id={regionId}
                  aria-label={`${TOOL_STATUS_LABELS[status].toLowerCase()} for ${agent.name}`}
                  className="mt-2 rounded-lg border border-white/10 bg-slate-950/70"
                >
                  <ul className="divide-y divide-white/5">
                    {entries.map((entry) => (
                      <li key={entry.id} className="p-3">
                        <Flex align="center" justify="between" gap="3">
                          <Box className="min-w-0">
                            <Text weight="medium" className="truncate text-white/90">
                              {entry.name ?? 'Unnamed invocation'}
                            </Text>
                            <Text size="1" color="gray" className="mt-1 block">
                              {summarizeObject(entry.args ?? entry.result, TOOL_PREVIEW_LIMIT) ??
                                'No preview available'}
                            </Text>
                          </Box>
                          <button
                            type="button"
                            onClick={() =>
                              setDetailsTarget({ agentId: agent.id, invocationId: entry.id })
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-accent/40 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-label="View full tool invocation details"
                          >
                            View details
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </Flex>
                      </li>
                    ))}
                  </ul>
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>
    );
  }

  function renderContextBundles(_agent: AgentHierarchyNode): JSX.Element | null {
    if (contextBundles.length === 0) {
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
            {contextBundles.length}
          </Badge>
        </button>

        {isExpanded ? (
          <Box
            role="region"
            id={regionId}
            aria-label={`context bundles for ${_agent.name}`}
            className="mt-2 space-y-2 rounded-lg border border-white/10 bg-slate-950/70 p-3"
          >
            {contextBundles.map((bundle) => (
              <Box key={bundle.id} className="space-y-1">
                <Text weight="medium" className="text-white/90">
                  {bundle.title}
                </Text>
                <Text size="1" color="gray">
                  {bundle.source}
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
        ) : null}
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
            className="mt-3 border-l border-dashed border-white/10 pl-3"
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
          <li key={node.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
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
      <Dialog open={detailsTarget != null} onOpenChange={(open) => !open && setDetailsTarget(null)}>
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

function groupToolInvocations(
  nodes: OrchestratorMetadataDto['toolInvocations'],
): Map<string, Map<ToolCallStatusDto, ToolInvocationNode[]>> {
  const grouped = new Map<string, Map<ToolCallStatusDto, ToolInvocationNode[]>>();

  for (const node of nodes) {
    const agentId = typeof node.metadata?.agentId === 'string' ? node.metadata.agentId : 'unknown';
    if (!grouped.has(agentId)) {
      grouped.set(agentId, new Map());
    }

    const groups = grouped.get(agentId)!;
    const status = node.status ?? 'pending';
    if (!groups.has(status)) {
      groups.set(status, []);
    }

    groups.get(status)!.push(node);
  }

  for (const [, groups] of grouped) {
    for (const status of TOOL_STATUS_ORDER) {
      const entries = groups.get(status);
      if (entries) {
        entries.sort((a, b) => {
          const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? '');
          const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? '');
          return bTime - aTime;
        });
      }
    }
  }

  return grouped;
}

function indexAgents(
  nodes: OrchestratorMetadataDto['agentHierarchy'],
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

function collectAgentLineage(
  nodes: OrchestratorMetadataDto['agentHierarchy'],
  targetId: string,
): Set<string> {
  const lineage = new Set<string>();

  const visit = (node: AgentHierarchyNode, ancestors: string[]): boolean => {
    if (node.id === targetId) {
      ancestors.forEach((id) => lineage.add(id));
      lineage.add(node.id);
      return true;
    }

    for (const child of node.children ?? []) {
      if (visit(child, [...ancestors, node.id])) {
        lineage.add(node.id);
        return true;
      }
    }

    return false;
  };

  for (const node of nodes) {
    visit(node, []);
  }

  return lineage;
}
