import type { ComponentProps } from 'react';
import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import type { OrchestratorMetadataDto, ToolCallStatusDto } from '@eddie/api-client';

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
  if (nodes.length === 0) {
    return (
      <Text size="2" color="gray">
        No tool calls recorded for this session yet.
      </Text>
    );
  }

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
        const args =
          rawArgs == null
            ? '—'
            : typeof rawArgs === 'string'
              ? rawArgs
              : summarizeObject(rawArgs) ?? '—';

        return (
          <li key={node.id} className="rounded-xl border border-muted/40 bg-muted/10 p-4">
            <Flex align="center" justify="between" gap="3">
              <Flex align="center" gap="2">
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

            <Flex align="center" justify="between" className="mt-3" gap="2">
              <Text size="1" color="gray">
                Captured {executedAtDisplay}
              </Text>
              <Text size="1" color="gray">
                Args: {args}
              </Text>
            </Flex>

            {node.children.length > 0 ? (
              <Box className="mt-3 border-l border-dashed border-muted/50 pl-3">
                <ToolTree nodes={node.children} />
              </Box>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
