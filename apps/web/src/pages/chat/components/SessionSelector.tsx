import { Badge, Button, Flex, IconButton, ScrollArea, Text } from '@radix-ui/themes';
import type { ChatSessionDto } from '@eddie/api-client';
import { Pencil1Icon, TrashIcon } from '@radix-ui/react-icons';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

export interface SessionSelectorMetricsSummary {
  messageCount?: number | null;
  agentCount?: number | null;
  contextBundleCount?: number | null;
}

const visuallyHiddenStyles: CSSProperties = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: 1,
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
};

function createMetricsSignature(metrics: SessionSelectorMetricsSummary | undefined): string {
  if (!metrics) {
    return '';
  }

  const values: Array<number | string> = [
    typeof metrics.messageCount === 'number' ? metrics.messageCount : '',
    typeof metrics.agentCount === 'number' ? metrics.agentCount : '',
    typeof metrics.contextBundleCount === 'number' ? metrics.contextBundleCount : '',
  ];

  return values.join('|');
}

function formatMetricCount(
  count: number | null | undefined,
  singular: string,
  plural: string,
): string | null {
  if (typeof count !== 'number') {
    return null;
  }

  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export type SessionSelectorSession = Pick<ChatSessionDto, 'id' | 'title' | 'status'> & {
  metrics?: SessionSelectorMetricsSummary;
};

export interface SessionSelectorProps {
  sessions: SessionSelectorSession[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onCreateSession: () => void;
  isCreatePending: boolean;
}

export function SessionSelector({
  sessions,
  selectedSessionId,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onCreateSession,
  isCreatePending,
}: SessionSelectorProps): JSX.Element {
  void onCreateSession;
  void isCreatePending;

  const metricsCacheRef = useRef<Map<string, string>>(new Map());
  const highlightTimeoutRef = useRef<number | null>(null);
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null);

  const clearHighlightTimeout = useCallback(() => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearHighlightTimeout();
    };
  }, [clearHighlightTimeout]);

  useEffect(() => {
    const seen = new Set<string>();

    sessions.forEach((session) => {
      const signature = createMetricsSignature(session.metrics);
      const previous = metricsCacheRef.current.get(session.id);
      if (
        previous !== undefined &&
        previous !== signature &&
        session.id === selectedSessionId &&
        highlightedSessionId !== session.id
      ) {
        setHighlightedSessionId(session.id);
        clearHighlightTimeout();
        highlightTimeoutRef.current = window.setTimeout(() => {
          setHighlightedSessionId((current) => (current === session.id ? null : current));
          highlightTimeoutRef.current = null;
        }, 2000);
      }

      metricsCacheRef.current.set(session.id, signature);
      seen.add(session.id);
    });

    for (const key of Array.from(metricsCacheRef.current.keys())) {
      if (!seen.has(key)) {
        metricsCacheRef.current.delete(key);
      }
    }

    if (!selectedSessionId) {
      setHighlightedSessionId(null);
    } else if (highlightedSessionId && highlightedSessionId !== selectedSessionId) {
      setHighlightedSessionId(null);
    }
  }, [
    clearHighlightTimeout,
    highlightedSessionId,
    selectedSessionId,
    sessions,
  ]);

  return (
    <ScrollArea type="always" className="mt-4 max-h-40">
      <Flex gap="2" wrap="wrap">
        {sessions.length === 0 ? (
          <Text size="2" color="gray">
            No sessions yet.
          </Text>
        ) : (
          sessions.map((session) => {
            const isSelected = session.id === selectedSessionId;
            const metrics = session.metrics;

            const formattedMetrics: Array<{ id: string; label: string }> = [];
            if (metrics) {
              const messageLabel = formatMetricCount(
                metrics.messageCount,
                'message',
                'messages',
              );
              if (messageLabel) {
                formattedMetrics.push({ id: 'messages', label: messageLabel });
              }

              const agentLabel = formatMetricCount(metrics.agentCount, 'agent', 'agents');
              if (agentLabel) {
                formattedMetrics.push({ id: 'agents', label: agentLabel });
              }

              const bundleLabel = formatMetricCount(
                metrics.contextBundleCount,
                'bundle',
                'bundles',
              );
              if (bundleLabel) {
                formattedMetrics.push({ id: 'bundles', label: bundleLabel });
              }
            }

            const metricsDescription = formattedMetrics.map((item) => item.label).join(', ');
            const metricsDescriptionId = metricsDescription
              ? `${session.id}-metrics-description`
              : undefined;
            const isHighlighted = isSelected && highlightedSessionId === session.id;

            return (
              <Flex key={session.id} align="center" gap="1">
                <Button
                  size="2"
                  variant={isSelected ? 'solid' : 'soft'}
                  color={isSelected ? 'jade' : 'gray'}
                  onClick={() => onSelectSession(session.id)}
                  aria-pressed={isSelected}
                  aria-label={session.title}
                  aria-describedby={metricsDescriptionId}
                >
                  <Flex align="center" gap="2">
                    <span>{session.title}</span>
                    {session.status === 'archived' ? (
                      <Badge color="gray" variant="soft">
                        Archived
                      </Badge>
                    ) : null}
                    {formattedMetrics.length > 0 ? (
                      <>
                        {metricsDescriptionId ? (
                          <span
                            id={metricsDescriptionId}
                            style={visuallyHiddenStyles}
                            role="status"
                            aria-live="polite"
                          >
                            {`${session.title} metrics: ${metricsDescription}`}
                          </span>
                        ) : null}
                        <Flex
                          align="center"
                          gap="2"
                          wrap="wrap"
                          aria-hidden="true"
                          data-highlighted={isHighlighted ? 'true' : undefined}
                        >
                          {formattedMetrics.map((item) => (
                            <Badge key={item.id} variant="soft" color="gray">
                              {item.label}
                            </Badge>
                          ))}
                        </Flex>
                      </>
                    ) : null}
                  </Flex>
                </Button>
                <IconButton
                  variant="ghost"
                  color="gray"
                  aria-label={`Rename ${session.title}`}
                  onClick={() => onRenameSession(session.id)}
                >
                  <Pencil1Icon />
                </IconButton>
                <IconButton
                  variant="ghost"
                  color="ruby"
                  aria-label={`Delete ${session.title}`}
                  onClick={() => onDeleteSession(session.id)}
                >
                  <TrashIcon />
                </IconButton>
              </Flex>
            );
          })
        )}
      </Flex>
    </ScrollArea>
  );
}
