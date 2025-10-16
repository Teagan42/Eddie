import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import { ArrowUpRight } from 'lucide-react';
import type { OrchestratorMetadataDto, ToolCallStatusDto } from '@eddie/api-client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/vendor/components/ui/dialog';
import { JsonTreeView } from '@/components/common';

import { summarizeObject } from '../chat-utils';

type BadgeColor = ComponentProps<typeof Badge>['color'];

const TOOL_STATUS_COLORS: Record<ToolCallStatusDto, BadgeColor> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
};

type ToolInvocationNode = OrchestratorMetadataDto['toolInvocations'][number];
type AgentHierarchyNode = OrchestratorMetadataDto['agentHierarchy'][number];

const TOOL_SECTION_PREFIX = 'tool:';
const AGENT_TOOLS_PREFIX = 'agent-tools:';
const AGENT_CHILDREN_PREFIX = 'agent-children:';
export const TOOL_DIALOG_CTA_ICON_TEST_ID = 'tool-dialog-cta-icon';
const TOGGLE_BUTTON_CLASS =
  'inline-flex h-6 w-6 items-center justify-center rounded-md border border-muted/50 bg-background text-xs font-medium text-foreground/80 transition-colors hover:bg-muted/40';
const TOOL_DIALOG_TRIGGER_CLASS =
  'inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function createToolSectionId(id: string): string {
  return `${TOOL_SECTION_PREFIX}${id}`;
}

function createAgentToolsSectionId(id: string): string {
  return `${AGENT_TOOLS_PREFIX}${id}`;
}

function createAgentChildrenSectionId(id: string): string {
  return `${AGENT_CHILDREN_PREFIX}${id}`;
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

export interface ToolTreeProps {
  nodes: OrchestratorMetadataDto['toolInvocations'];
  agentHierarchy?: OrchestratorMetadataDto['agentHierarchy'];
}

const EMPTY_AGENT_HIERARCHY: OrchestratorMetadataDto['agentHierarchy'] = [];

export function ToolTree({
  nodes,
  agentHierarchy,
}: ToolTreeProps): JSX.Element {
  const resolvedAgentHierarchy = agentHierarchy ?? EMPTY_AGENT_HIERARCHY;
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const seenToolIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const toolEntries = collectToolEntries(nodes);
    if (toolEntries.length === 0) {
      seenToolIdsRef.current = new Set();
      return;
    }

    const seenIds = seenToolIdsRef.current;
    const currentIds = new Set(toolEntries.map((entry) => entry.node.id));
    const newEntries = toolEntries.filter(
      (entry) => !seenIds.has(entry.node.id),
    );
    seenToolIdsRef.current = currentIds;

    if (newEntries.length === 0) {
      return;
    }

    const latestEntry = pickLatestToolEntry(newEntries);
    if (!latestEntry) {
      return;
    }

    const idsToExpand = new Set<string>();
    getToolToggleIds(latestEntry).forEach((id) => idsToExpand.add(id));

    const agentId =
      typeof latestEntry.node.metadata?.agentId === 'string'
        ? latestEntry.node.metadata.agentId
        : null;

    getAgentToggleIds(resolvedAgentHierarchy, agentId).forEach((id) =>
      idsToExpand.add(id),
    );

    if (idsToExpand.size === 0) {
      return;
    }

    setExpandedSectionIds((previous) => {
      let changed = false;
      const next = new Set(previous);

      idsToExpand.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [nodes, resolvedAgentHierarchy]);

  const toggleSection = useCallback((id: string) => {
    setExpandedSectionIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  const nodesByAgent = groupToolInvocationsByAgent(nodes);

  const getAgentTools = (agentId: string): ToolInvocationNode[] =>
    nodesByAgent.get(agentId) ?? [];

  const hasAgentHierarchy = resolvedAgentHierarchy.length > 0;
  const hasToolInvocations = nodes.length > 0;

  if (!hasToolInvocations && !hasAgentHierarchy) {
    return (
      <Text size="2" color="gray">
        No tool calls recorded for this session yet.
      </Text>
    );
  }

  if (!hasAgentHierarchy) {
    return (
      <ToolTreeList
        nodes={nodes}
        expandedSectionIds={expandedSectionIds}
        onToggleSection={toggleSection}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {resolvedAgentHierarchy.map((agent) => (
        <AgentToolTreeNode
          key={agent.id}
          agent={agent}
          getAgentTools={getAgentTools}
          expandedSectionIds={expandedSectionIds}
          onToggleSection={toggleSection}
        />
      ))}
    </ul>
  );
}

function groupToolInvocationsByAgent(
  nodes: ToolInvocationNode[],
): Map<string, OrchestratorMetadataDto['toolInvocations']> {
  const map = new Map<string, OrchestratorMetadataDto['toolInvocations']>();

  const assignNodeToAgent = (node: ToolInvocationNode): void => {
    const agentId =
      typeof node.metadata?.agentId === 'string' ? node.metadata.agentId : null;
    if (agentId) {
      const existing = map.get(agentId) ?? [];
      existing.push(node);
      map.set(agentId, existing);
    }

    for (const child of node.children) {
      assignNodeToAgent(child);
    }
  };

  for (const node of nodes) {
    assignNodeToAgent(node);
  }

  return map;
}

function cloneToolNodesForAgent(
  nodes: ToolInvocationNode[],
  agentId: string,
): ToolInvocationNode[] {
  return nodes
    .filter((node) => node.metadata?.agentId === agentId)
    .map((node) => cloneToolNodeForAgent(node, agentId));
}

function cloneToolNodeForAgent(
  node: ToolInvocationNode,
  agentId: string,
): ToolInvocationNode {
  const filteredChildren = node.children
    .filter((child) => child.metadata?.agentId === agentId)
    .map((child) => cloneToolNodeForAgent(child, agentId));

  return {
    ...node,
    children: filteredChildren,
  };
}

interface AgentToolTreeNodeProps {
  agent: AgentHierarchyNode;
  expandedSectionIds: ReadonlySet<string>;
  onToggleSection: (id: string) => void;
  getAgentTools: (agentId: string) => ToolInvocationNode[];
}

function AgentToolTreeNode({
  agent,
  expandedSectionIds,
  onToggleSection,
  getAgentTools,
}: AgentToolTreeNodeProps): JSX.Element {
  const agentChildrenKey = createAgentChildrenSectionId(agent.id);
  const agentToolsKey = createAgentToolsSectionId(agent.id);
  const hasChildAgents = agent.children.length > 0;
  const showChildAgents =
    hasChildAgents && expandedSectionIds.has(agentChildrenKey);
  const rawAgentTools = getAgentTools(agent.id);
  const agentTools = cloneToolNodesForAgent(rawAgentTools, agent.id);
  const hasAgentTools = agentTools.length > 0;
  const showAgentTools = expandedSectionIds.has(agentToolsKey);
  const depthLabel =
    typeof agent.depth === 'number' ? `depth ${agent.depth}` : null;
  const messageCount =
    typeof agent.metadata?.messageCount === 'number'
      ? agent.metadata.messageCount
      : null;

  return (
    <li className="rounded-xl border border-muted/40 bg-muted/5 p-4">
      <Flex direction="column" gap="3">
        <Flex align="center" justify="between" gap="3">
          <Flex align="center" gap="2">
            {hasChildAgents ? (
              <button
                type="button"
                onClick={() => onToggleSection(agentChildrenKey)}
                aria-expanded={showChildAgents}
                aria-label={`Toggle ${agent.name} agents`}
                className={TOGGLE_BUTTON_CLASS}
              >
                {showChildAgents ? '−' : '+'}
              </button>
            ) : null}
            <Badge variant="soft" color="violet">
              Agent
            </Badge>
            <Text weight="medium">{agent.name}</Text>
            {depthLabel ? (
              <Badge variant="soft" color="gray">
                {depthLabel}
              </Badge>
            ) : null}
          </Flex>
          <Flex align="center" gap="2">
            {agent.provider ? (
              <Badge variant="soft" color="blue">
                {agent.provider}
              </Badge>
            ) : null}
            {agent.model ? (
              <Badge variant="soft" color="gray">
                {agent.model}
              </Badge>
            ) : null}
          </Flex>
        </Flex>

        {messageCount !== null ? (
          <Text size="1" color="gray">
            Messages observed: {messageCount}
          </Text>
        ) : null}

        {hasAgentTools ? (
          <Flex align="center" gap="2">
            <button
              type="button"
              onClick={() => onToggleSection(agentToolsKey)}
              aria-expanded={showAgentTools}
              aria-label={`Toggle ${agent.name} tools`}
              className={TOGGLE_BUTTON_CLASS}
            >
              {showAgentTools ? '−' : '+'}
            </button>
            <Text size="1" color="gray">
              Tools recorded: {agentTools.length}
            </Text>
          </Flex>
        ) : (
          <Text size="1" color="gray">
            No tool calls recorded for this agent yet.
          </Text>
        )}

        {showAgentTools ? (
          <Box className="border-l border-dashed border-muted/50 pl-3">
            <ToolTreeList
              nodes={agentTools}
              expandedSectionIds={expandedSectionIds}
              onToggleSection={onToggleSection}
            />
          </Box>
        ) : null}

        {showChildAgents ? (
          <Box className="border-l border-dashed border-muted/50 pl-3">
            <ul className="space-y-3">
              {agent.children.map((child) => (
                <AgentToolTreeNode
                  key={child.id}
                  agent={child}
                  expandedSectionIds={expandedSectionIds}
                  onToggleSection={onToggleSection}
                  getAgentTools={getAgentTools}
                />
              ))}
            </ul>
          </Box>
        ) : null}
      </Flex>
    </li>
  );
}

interface ToolTreeListProps {
  nodes: OrchestratorMetadataDto['toolInvocations'];
  expandedSectionIds: ReadonlySet<string>;
  onToggleSection: (id: string) => void;
}

function ToolTreeList({
  nodes,
  expandedSectionIds,
  onToggleSection,
}: ToolTreeListProps): JSX.Element {
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
        const executedAtDisplay = executedAt ?? '—';

        const rawArgs = node.metadata?.arguments ?? node.metadata?.args ?? null;
        const parsedArgs = parseJsonValue(rawArgs);
        const hasExplorer = parsedArgs != null;
        const argsSummary =
          rawArgs == null
            ? '—'
            : typeof rawArgs === 'string'
              ? rawArgs
              : summarizeObject(rawArgs) ?? '—';
        const argsLabel = hasExplorer ? 'Args:' : `Args: ${argsSummary}`;
        const rawResult = node.metadata?.result ?? node.metadata?.output ?? null;
        const resultSummary =
          rawResult == null ? '—' : summarizeObject(rawResult) ?? '—';
        const hasChildren = node.children.length > 0;
        const sectionId = createToolSectionId(node.id);
        const isExpanded = expandedSectionIds.has(sectionId);
        const showChildren = hasChildren && isExpanded;
        const toggleLabel = `Toggle ${node.name} children`;
        const uppercaseStatus = node.status.toUpperCase();
        const dialogTitle = `Tool call: ${node.name}`;

        return (
          <Dialog key={node.id}>
            <li className="rounded-xl border border-muted/40 bg-muted/10 p-4">
              <Flex align="center" justify="between" gap="3">
                <Flex align="center" gap="2">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={() => onToggleSection(sectionId)}
                      aria-expanded={isExpanded}
                      aria-label={toggleLabel}
                      className={TOGGLE_BUTTON_CLASS}
                    >
                      {isExpanded ? '−' : '+'}
                    </button>
                  ) : null}
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      aria-label={`View ${node.name} tool call details`}
                      className={TOOL_DIALOG_TRIGGER_CLASS}
                    >
                      <Badge variant="soft" color="gray">
                        Tool
                      </Badge>
                      <Text weight="medium" className="font-mono text-sm">
                        {node.name}
                      </Text>
                      <ArrowUpRight
                        aria-hidden="true"
                        data-testid={TOOL_DIALOG_CTA_ICON_TEST_ID}
                        className="h-4 w-4"
                      />
                    </button>
                  </DialogTrigger>
                </Flex>
                <Badge color={statusColor} variant="soft">
                  {uppercaseStatus}
                </Badge>
              </Flex>

              {command ? (
                <Box className="mt-3 rounded-md bg-background/80 p-3 font-mono text-xs text-foreground/80">
                  {command}
                </Box>
              ) : null}

              <Box className="mt-3 space-y-2">
                <Flex align="center" justify="between" gap="2">
                  <Text size="1" color="gray">
                    Captured {executedAtDisplay}
                  </Text>
                  <Text size="1" color="gray">
                    {argsLabel}
                  </Text>
                </Flex>

                {hasExplorer ? (
                  <JsonTreeView
                    value={parsedArgs as unknown}
                    collapsedByDefault
                    className="text-left"
                  />
                ) : null}

                <Text size="1" color="gray">
                  Result: {resultSummary}
                </Text>
              </Box>

              {showChildren ? (
                <Box className="mt-3 border-l border-dashed border-muted/50 pl-3">
                  <ToolTreeList
                    nodes={node.children}
                    expandedSectionIds={expandedSectionIds}
                    onToggleSection={onToggleSection}
                  />
                </Box>
              ) : null}

              <DialogContent className="max-h-[85vh] space-y-4 overflow-y-auto">
                <DialogHeader className="text-left">
                  <DialogTitle className="font-mono text-base">
                    {dialogTitle}
                  </DialogTitle>
                  <DialogDescription>
                    Captured {executedAtDisplay} • Status {uppercaseStatus}
                  </DialogDescription>
                </DialogHeader>
                <Box className="space-y-3 text-left">
                  <JsonTreeView
                    value={node as unknown}
                    collapsedByDefault
                    className="text-left"
                  />
                </Box>
              </DialogContent>
            </li>
          </Dialog>
        );
      })}
    </ul>
  );
}

function parseJsonValue(value: unknown): unknown | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return value;
  }

  return null;
}

interface ToolEntry {
  node: ToolInvocationNode;
  path: string[];
}

function getToolToggleIds(entry: ToolEntry): string[] {
  const ids: string[] = [];

  for (const ancestorId of entry.path.slice(0, -1)) {
    ids.push(createToolSectionId(ancestorId));
  }

  if (entry.node.children.length > 0) {
    ids.push(createToolSectionId(entry.node.id));
  }

  return ids;
}

function collectToolEntries(
  nodes: ToolInvocationNode[],
  parentPath: string[] = [],
): ToolEntry[] {
  const entries: ToolEntry[] = [];

  for (const node of nodes) {
    const path = [...parentPath, node.id];
    entries.push({ node, path });
    const children = node.children ?? [];
    entries.push(...collectToolEntries(children, path));
  }

  return entries;
}

function pickLatestToolEntry(entries: ToolEntry[]): ToolEntry | null {
  if (entries.length === 0) {
    return null;
  }

  let latestEntry = entries[0];
  let latestTimestamp = getToolTimestamp(entries[0].node);
  let latestIndex = 0;

  entries.forEach((entry, index) => {
    const timestamp = getToolTimestamp(entry.node);
    if (
      timestamp > latestTimestamp ||
      (timestamp === latestTimestamp && index > latestIndex)
    ) {
      latestEntry = entry;
      latestTimestamp = timestamp;
      latestIndex = index;
    }
  });

  return latestEntry;
}

function getToolTimestamp(node: ToolInvocationNode): number {
  return parseTimestamp(node.metadata?.createdAt);
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) {
      return time;
    }
  }

  return Number.NEGATIVE_INFINITY;
}

function buildAgentPaths(
  agentHierarchy: AgentHierarchyNode[],
): Map<string, AgentHierarchyNode[]> {
  const map = new Map<string, AgentHierarchyNode[]>();

  const visit = (
    agent: AgentHierarchyNode,
    parentPath: AgentHierarchyNode[],
  ): void => {
    const path = [...parentPath, agent];
    map.set(agent.id, path);
    for (const child of agent.children) {
      visit(child, path);
    }
  };

  for (const agent of agentHierarchy) {
    visit(agent, []);
  }

  return map;
}

function getAgentToggleIds(
  agentHierarchy: AgentHierarchyNode[],
  agentId: string | null,
): string[] {
  if (!agentId) {
    return [];
  }

  const agentPathsById = buildAgentPaths(agentHierarchy);
  const agentPath = agentPathsById.get(agentId);
  if (!agentPath) {
    return [];
  }

  const ids: string[] = [];
  for (let index = 0; index < agentPath.length - 1; index += 1) {
    ids.push(createAgentChildrenSectionId(agentPath[index].id));
  }

  const leafAgent = agentPath[agentPath.length - 1];
  ids.push(createAgentToolsSectionId(leafAgent.id));

  return ids;
}
