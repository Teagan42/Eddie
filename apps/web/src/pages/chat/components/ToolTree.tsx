import { useCallback, useState } from 'react';
import type { ComponentProps } from 'react';
import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import type { OrchestratorMetadataDto, ToolCallStatusDto } from '@eddie/api-client';

import { JsonExplorer } from '@/components/common/JsonExplorer';

import { summarizeObject } from '../chat-utils';

type BadgeColor = ComponentProps<typeof Badge>['color'];

const TOOL_STATUS_COLORS: Record<ToolCallStatusDto, BadgeColor> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
};

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
}

export function ToolTree({ nodes }: ToolTreeProps): JSX.Element {
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleNode = useCallback((id: string) => {
    setExpandedNodeIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }, []);

  if (nodes.length === 0) {
    return (
      <Text size="2" color="gray">
        No tool calls recorded for this session yet.
      </Text>
    );
  }

  return (
    <ToolTreeList
      nodes={nodes}
      expandedNodeIds={expandedNodeIds}
      onToggleNode={toggleNode}
    />
  );
}

interface ToolTreeListProps {
  nodes: OrchestratorMetadataDto['toolInvocations'];
  expandedNodeIds: ReadonlySet<string>;
  onToggleNode: (id: string) => void;
}

function ToolTreeList({
  nodes,
  expandedNodeIds,
  onToggleNode,
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
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedNodeIds.has(node.id);
        const showChildren = hasChildren && isExpanded;
        const toggleLabel = `Toggle ${node.name} children`;

        return (
          <li key={node.id} className="rounded-xl border border-muted/40 bg-muted/10 p-4">
            <Flex align="center" justify="between" gap="3">
              <Flex align="center" gap="2">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => onToggleNode(node.id)}
                    aria-expanded={isExpanded}
                    aria-label={toggleLabel}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-muted/50 bg-background text-xs font-medium text-foreground/80 transition-colors hover:bg-muted/40"
                  >
                    {isExpanded ? '−' : '+'}
                  </button>
                ) : null}
                <Badge variant="soft" color="gray">
                  Tool
                </Badge>
                <Text weight="medium" className="font-mono text-sm">
                  {node.name}
                </Text>
              </Flex>
              <Badge color={statusColor} variant="soft">
                {node.status.toUpperCase()}
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
                <JsonExplorer
                  value={parsedArgs as unknown}
                  collapsedByDefault
                  className="text-left"
                />
              ) : null}
            </Box>

            {showChildren ? (
              <Box className="mt-3 border-l border-dashed border-muted/50 pl-3">
                <ToolTreeList
                  nodes={node.children}
                  expandedNodeIds={expandedNodeIds}
                  onToggleNode={onToggleNode}
                />
              </Box>
            ) : null}
          </li>
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
