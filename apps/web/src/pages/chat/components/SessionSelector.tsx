import type { ChatSessionDto } from '@eddie/api-client';
import { Badge, Button, DropdownMenu, Flex, IconButton, ScrollArea, Text } from '@radix-ui/themes';
import {
  CardStackIcon,
  ChatBubbleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DotsHorizontalIcon,
} from '@radix-ui/react-icons';
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { clsx } from 'clsx';

export interface SessionSelectorMetricsSummary {
  messageCount?: number | null;
  agentCount?: number | null;
  contextBundleCount?: number | null;
}

interface SessionMetricBadge {
  id: string;
  ariaLabel: string;
  displayValue: string;
  icon?: JSX.Element;
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const listId = useId();

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

  const baseToggleLabel = isCollapsed ? 'Expand session list' : 'Collapse session list';
  const sessionCountLabel = formatMetricCount(sessions.length, 'session', 'sessions');
  const toggleLabel = sessionCountLabel
    ? `${baseToggleLabel} (${sessionCountLabel})`
    : baseToggleLabel;
  const ToggleIcon = isCollapsed ? ChevronDownIcon : ChevronUpIcon;

  const renderSession = (session: SessionSelectorSession): JSX.Element => {
    const isSelected = session.id === selectedSessionId;
    const metrics = session.metrics;

    const formattedMetrics: SessionMetricBadge[] = [];
    if (metrics) {
      if (typeof metrics.messageCount === 'number') {
        const messageLabel = formatMetricCount(
          metrics.messageCount,
          'message',
          'messages',
        );
        if (messageLabel) {
          formattedMetrics.push({
            id: 'messages',
            ariaLabel: messageLabel,
            displayValue: `${metrics.messageCount}`,
            icon: <ChatBubbleIcon aria-hidden="true" />,
          });
        }
      }

      const agentLabel = formatMetricCount(metrics.agentCount, 'agent', 'agents');
      if (agentLabel) {
        formattedMetrics.push({
          id: 'agents',
          ariaLabel: agentLabel,
          displayValue: agentLabel,
        });
      }

      if (typeof metrics.contextBundleCount === 'number') {
        const bundleLabel = formatMetricCount(
          metrics.contextBundleCount,
          'bundle',
          'bundles',
        );
        if (bundleLabel) {
          formattedMetrics.push({
            id: 'bundles',
            ariaLabel: bundleLabel,
            displayValue: `${metrics.contextBundleCount}`,
            icon: <CardStackIcon aria-hidden="true" />,
          });
        }
      }
    }

    const metricsDescription = formattedMetrics.map((item) => item.ariaLabel).join(', ');
    const metricsDescriptionId = metricsDescription
      ? `${session.id}-metrics-description`
      : undefined;
    const isHighlighted = isSelected && highlightedSessionId === session.id;
    const menuTriggerLabel = `Session options for ${session.title}`;

    const selectedState = isSelected ? 'true' : undefined;

    return (
      <Flex
        key={session.id}
        align="center"
        gap="1"
        className={clsx(
          'rounded-lg px-2 py-1 transition-colors',
          isSelected ? 'bg-[var(--jade-4)] text-[var(--jade-12)]' : undefined,
        )}
        data-selected={selectedState}
      >
        <Button
          size="1"
          variant={isSelected ? 'solid' : 'soft'}
          color={isSelected ? 'jade' : 'gray'}
          onClick={() => onSelectSession(session.id)}
          aria-pressed={isSelected}
          aria-label={session.title}
          aria-describedby={metricsDescriptionId}
          data-selected={selectedState}
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
                  gap="1"
                  wrap="wrap"
                  aria-hidden="true"
                  data-highlighted={isHighlighted ? 'true' : undefined}
                >
                  {formattedMetrics.map((item) => (
                    <Badge
                      key={item.id}
                      variant="soft"
                      color="gray"
                      aria-label={item.ariaLabel}
                      title={item.ariaLabel}
                      data-has-icon={item.icon ? 'true' : undefined}
                    >
                      <Flex align="center" gap="1" aria-hidden="true">
                        {item.icon ? <span className="text-[var(--gray-12)]">{item.icon}</span> : null}
                        <span>{item.displayValue}</span>
                      </Flex>
                    </Badge>
                  ))}
                </Flex>
              </>
            ) : null}
          </Flex>
        </Button>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <IconButton
              variant="ghost"
              color="gray"
              size="1"
              aria-label={menuTriggerLabel}
              title={menuTriggerLabel}
            >
              <DotsHorizontalIcon />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item onSelect={() => onRenameSession(session.id)}>
              Rename session
            </DropdownMenu.Item>
            <DropdownMenu.Item color="ruby" onSelect={() => onDeleteSession(session.id)}>
              Archive session
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
    );
  };

  return (
    <Flex direction="column" gap="2" className="mt-4">
      <Flex justify="end">
        <Button
          variant="ghost"
          size="1"
          onClick={() => setIsCollapsed((current) => !current)}
          aria-expanded={isCollapsed ? 'false' : 'true'}
          aria-controls={listId}
        >
          <Flex align="center" gap="1">
            <ToggleIcon aria-hidden="true" />
            <span>{toggleLabel}</span>
          </Flex>
        </Button>
      </Flex>

      {isCollapsed ? null : (
        <ScrollArea type="always" className="max-h-40" id={listId}>
          <Flex gap="2" wrap="wrap">
            {sessions.length === 0 ? (
              <Text size="2" color="gray">
                No sessions yet.
              </Text>
            ) : (
              sessions.map(renderSession)
            )}
          </Flex>
        </ScrollArea>
      )}
    </Flex>
  );
}
