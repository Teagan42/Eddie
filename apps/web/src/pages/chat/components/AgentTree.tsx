import { useCallback, useMemo, useState } from 'react';
import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import type { OrchestratorMetadataDto } from '@eddie/api-client';
import { cn } from '@/vendor/lib/utils';

export interface AgentTreeProps {
  nodes: OrchestratorMetadataDto['agentHierarchy'];
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string | null) => void;
  highlightedAgentIds?: ReadonlySet<string> | null;
}

type AgentHierarchyNode = OrchestratorMetadataDto['agentHierarchy'][number];

export function AgentTree({
  nodes,
  selectedAgentId,
  onSelectAgent,
  highlightedAgentIds: highlightedAgentIdsProp,
}: AgentTreeProps): JSX.Element {
  const [uncontrolledSelection, setUncontrolledSelection] = useState<string | null>(null);
  const isControlled = selectedAgentId !== undefined;
  const activeSelection = isControlled ? selectedAgentId : uncontrolledSelection;
  const highlightedAgentIds = useMemo(() => {
    if (highlightedAgentIdsProp) {
      return highlightedAgentIdsProp;
    }

    if (!activeSelection) {
      return null;
    }

    return collectHighlightedAgentIds(nodes, activeSelection);
  }, [activeSelection, highlightedAgentIdsProp, nodes]);

  const handleSelect = useCallback(
    (agentId: string) => {
      const nextSelection = agentId === activeSelection ? null : agentId;

      if (!isControlled) {
        setUncontrolledSelection(nextSelection);
      }

      onSelectAgent?.(nextSelection);
    },
    [activeSelection, isControlled, onSelectAgent],
  );

  if (nodes.length === 0) {
    return (
      <Text size="2" color="gray">
        Orchestrator has not spawned any agents yet.
      </Text>
    );
  }

  return (
    <ul className="space-y-3">
      {nodes.map((node) => (
        <AgentTreeNode
          key={node.id}
          node={node}
          onSelect={handleSelect}
          selectedAgentId={activeSelection ?? null}
          highlightedAgentIds={highlightedAgentIds}
        />
      ))}
    </ul>
  );
}

interface AgentTreeNodeProps {
  node: AgentHierarchyNode;
  selectedAgentId: string | null;
  onSelect: (agentId: string) => void;
  highlightedAgentIds: ReadonlySet<string> | null;
}

function AgentTreeNode({
  node,
  selectedAgentId,
  onSelect,
  highlightedAgentIds,
}: AgentTreeNodeProps): JSX.Element {
  const providerLabel = node.provider ?? 'Unknown provider';
  const modelLabel = node.model ?? 'Unknown model';
  const depth = typeof node.depth === 'number' ? node.depth : null;
  const messageCount =
    typeof node.metadata?.messageCount === 'number' ? node.metadata.messageCount : null;
  const isLineage = highlightedAgentIds?.has(node.id) ?? false;
  const itemClassName = cn(
    'rounded-xl border border-muted/40 bg-muted/5 p-4 transition',
    isLineage && 'border-accent/60 bg-accent/10 ring-2 ring-accent ring-offset-2',
  );

  return (
    <li className={itemClassName}>
      <Flex direction="column" gap="2">
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          aria-pressed={node.id === selectedAgentId}
          aria-label={`Select ${node.name} agent`}
          className="w-full text-left"
        >
          <Flex align="center" gap="2">
            <Text weight="medium">{node.name}</Text>
            {depth !== null ? (
              <Badge variant="soft" color="gray">
                depth {depth}
              </Badge>
            ) : null}
          </Flex>
        </button>
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
            <AgentTree
              nodes={node.children}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelect}
              highlightedAgentIds={highlightedAgentIds}
            />
          </Box>
        ) : null}
      </Flex>
    </li>
  );
}

function collectHighlightedAgentIds(
  nodes: OrchestratorMetadataDto['agentHierarchy'],
  selectedAgentId: string,
): ReadonlySet<string> {
  const highlighted = new Set<string>();

  const addDescendants = (node: AgentHierarchyNode): void => {
    highlighted.add(node.id);
    for (const child of node.children ?? []) {
      addDescendants(child);
    }
  };

  const visit = (node: AgentHierarchyNode): boolean => {
    if (node.id === selectedAgentId) {
      addDescendants(node);
      return true;
    }

    let containsSelected = false;
    for (const child of node.children ?? []) {
      if (visit(child)) {
        containsSelected = true;
      }
    }

    if (containsSelected) {
      highlighted.add(node.id);
    }

    return containsSelected;
  };

  for (const node of nodes) {
    visit(node);
  }

  return highlighted;
}
