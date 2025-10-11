import { Badge, Box, Flex, Text } from '@radix-ui/themes';
import type { OrchestratorMetadataDto } from '@eddie/api-client';

export interface AgentTreeProps {
  nodes: OrchestratorMetadataDto['agentHierarchy'];
}

export function AgentTree({ nodes }: AgentTreeProps): JSX.Element {
  if (nodes.length === 0) {
    return (
      <Text size="2" color="gray">
        Orchestrator has not spawned any agents yet.
      </Text>
    );
  }

  return (
    <ul className="space-y-3">
      {nodes.map((node) => {
        const providerLabel = node.provider ?? 'Unknown provider';
        const modelLabel = node.model ?? 'Unknown model';
        const depth = typeof node.depth === 'number' ? node.depth : null;
        const messageCount =
          typeof node.metadata?.messageCount === 'number' ? node.metadata.messageCount : null;

        return (
          <li key={node.id} className="rounded-xl border border-muted/40 bg-muted/5 p-4">
            <Flex direction="column" gap="2">
              <Flex align="center" gap="2">
                <Text weight="medium">{node.name}</Text>
                {depth !== null ? (
                  <Badge variant="soft" color="gray">
                    depth {depth}
                  </Badge>
                ) : null}
              </Flex>
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
                  <AgentTree nodes={node.children} />
                </Box>
              ) : null}
            </Flex>
          </li>
        );
      })}
    </ul>
  );
}
