import type { ChatSessionDto } from '@eddie/api-client';
import { Badge, Button, DropdownMenu, Flex, IconButton, ScrollArea, Text } from '@radix-ui/themes';
import {
  CardStackIcon,
  ChatBubbleIcon,
  DotsHorizontalIcon,
} from '@radix-ui/react-icons';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { clsx } from 'clsx';
import {
  Tabs as TabsRoot,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/vendor/components/ui/tabs';

export const SESSION_TABLIST_ARIA_LABEL = 'Chat sessions';

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

const indicatorTransitionStyle =
  'transform 300ms ease, width 300ms ease, height 300ms ease';

type SessionCategory = 'active' | 'archived';

const CATEGORY_LABELS: Record<SessionCategory, string> = {
  active: 'Active',
  archived: 'Archived',
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
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const tabItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const tabTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null);
  const sessionsByCategory = useMemo(() => {
    const grouped: Record<SessionCategory, SessionSelectorSession[]> = {
      active: [],
      archived: [],
    };

    sessions.forEach((session) => {
      if (session.status === 'archived') {
        grouped.archived.push(session);
      } else {
        grouped.active.push(session);
      }
    });

    return grouped;
  }, [sessions]);

  const hasArchivedSessions = sessionsByCategory.archived.length > 0;

  const categoryDefinitions = useMemo(
    () => [
      {
        id: 'active' as const,
        label: CATEGORY_LABELS.active,
      },
      ...(hasArchivedSessions
        ? [
          {
            id: 'archived' as const,
            label: CATEGORY_LABELS.archived,
          },
        ]
        : []),
    ],
    [hasArchivedSessions],
  );

  const isArchivedSelected = useMemo(() => {
    const selected = sessions.find((session) => session.id === selectedSessionId);
    return selected?.status === 'archived';
  }, [sessions, selectedSessionId]);

  const fallbackCategory = categoryDefinitions[0]?.id ?? 'active';

  const [activeCategory, setActiveCategory] = useState<SessionCategory>(() => {
    if (isArchivedSelected && hasArchivedSessions) {
      return 'archived';
    }
    return fallbackCategory;
  });

  const previousArchivedSelectionRef = useRef(isArchivedSelected);

  useEffect(() => {
    const availableIds = new Set(categoryDefinitions.map((category) => category.id));
    const fallback = availableIds.has(fallbackCategory) ? fallbackCategory : 'active';

    if (!availableIds.has(activeCategory)) {
      const next = availableIds.has('archived') ? 'archived' : fallback;
      if (next !== activeCategory) {
        setActiveCategory(next);
      }
    } else {
      if (isArchivedSelected && activeCategory !== 'archived' && availableIds.has('archived')) {
        setActiveCategory('archived');
      } else {
        const previouslyArchived = previousArchivedSelectionRef.current;

        if (
          previouslyArchived &&
          !isArchivedSelected &&
          activeCategory === 'archived' &&
          (availableIds.has('active') || availableIds.has(fallback))
        ) {
          const next = availableIds.has('active') ? 'active' : fallback;
          setActiveCategory(next);
        }
      }
    }
    previousArchivedSelectionRef.current = isArchivedSelected;
  }, [categoryDefinitions, activeCategory, fallbackCategory, isArchivedSelected]);

  const visibleSessions = useMemo(() => {
    return sessionsByCategory[activeCategory] ?? [];
  }, [sessionsByCategory, activeCategory]);

  const sessionIds = useMemo(
    () => visibleSessions.map((session) => session.id),
    [visibleSessions],
  );
  const sessionIdsSignature = useMemo(() => sessionIds.join('|'), [sessionIds]);

  const clearHighlightTimeout = useCallback(() => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, []);

  const registerTabItem = useCallback((sessionId: string, element: HTMLDivElement | null) => {
    if (element) {
      tabItemRefs.current.set(sessionId, element);
    } else {
      tabItemRefs.current.delete(sessionId);
    }
  }, []);

  const registerTabTrigger = useCallback(
    (sessionId: string, element: HTMLButtonElement | null) => {
      if (element) {
        tabTriggerRefs.current.set(sessionId, element);
      } else {
        tabTriggerRefs.current.delete(sessionId);
      }
    },
    [],
  );

  const updateIndicatorPosition = useCallback(() => {
    const indicator = indicatorRef.current;
    const list = tabListRef.current;

    if (!indicator || !list) {
      return;
    }

    if (!selectedSessionId) {
      indicator.style.opacity = '0';
      return;
    }

    const selectedItem = tabItemRefs.current.get(selectedSessionId);
    if (!selectedItem) {
      indicator.style.opacity = '0';
      return;
    }

    const listRect = list.getBoundingClientRect();
    const itemRect = selectedItem.getBoundingClientRect();

    indicator.style.opacity = '1';
    indicator.style.width = `${itemRect.width}px`;
    indicator.style.height = `${itemRect.height}px`;
    indicator.style.transform = `translate3d(${itemRect.left - listRect.left}px, ${
      itemRect.top - listRect.top
    }px, 0)`;
  }, [selectedSessionId]);

  useEffect(() => {
    return () => {
      clearHighlightTimeout();
    };
  }, [clearHighlightTimeout]);

  useEffect(() => {
    window.addEventListener('resize', updateIndicatorPosition);

    return () => {
      window.removeEventListener('resize', updateIndicatorPosition);
    };
  }, [updateIndicatorPosition]);

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

  useLayoutEffect(() => {
    updateIndicatorPosition();
  }, [updateIndicatorPosition, sessionIdsSignature, activeCategory]);

  const focusSession = useCallback((sessionId: string) => {
    const trigger = tabTriggerRefs.current.get(sessionId);
    trigger?.focus();
  }, []);

  const handleNavigationKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, sessionId: string) => {
      if (sessionIds.length === 0) {
        return;
      }

      let targetId: string | null = null;
      const currentIndex = sessionIds.indexOf(sessionId);

      if (currentIndex === -1) {
        return;
      }

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown': {
          event.preventDefault();
          const nextIndex = (currentIndex + 1) % sessionIds.length;
          targetId = sessionIds[nextIndex];
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          event.preventDefault();
          const nextIndex = (currentIndex - 1 + sessionIds.length) % sessionIds.length;
          targetId = sessionIds[nextIndex];
          break;
        }
        case 'Home': {
          event.preventDefault();
          targetId = sessionIds[0] ?? null;
          break;
        }
        case 'End': {
          event.preventDefault();
          targetId = sessionIds[sessionIds.length - 1] ?? null;
          break;
        }
        default:
          return;
      }

      if (!targetId) {
        return;
      }

      focusSession(targetId);

      if (targetId !== sessionId) {
        onSelectSession(targetId);
      }
    },
    [focusSession, onSelectSession, sessionIds],
  );

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
        className="relative rounded-lg px-2 py-1 transition-colors"
        data-selected={selectedState}
        ref={(element) => {
          registerTabItem(session.id, element);
        }}
      >
        <Button
          size="1"
          variant={isSelected ? 'solid' : 'soft'}
          color={isSelected ? 'jade' : 'gray'}
          onClick={() => onSelectSession(session.id)}
          role="tab"
          aria-selected={isSelected ? 'true' : 'false'}
          aria-label={session.title}
          aria-describedby={metricsDescriptionId}
          data-selected={selectedState}
          tabIndex={isSelected ? 0 : -1}
          onKeyDown={(event) => handleNavigationKeyDown(event, session.id)}
          ref={(element) => {
            registerTabTrigger(session.id, element);
          }}
          className={clsx('relative z-10', isSelected ? undefined : 'bg-transparent')}
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
    <TabsRoot
      value={activeCategory}
      onValueChange={(value) => setActiveCategory(value as SessionCategory)}
      className="mt-4 flex flex-col gap-3"
    >
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <TabsList
          aria-label="Session categories"
          className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--slate-3)] p-1 text-[color:var(--slate-12)] dark:bg-[color:var(--slate-5)]"
        >
          {categoryDefinitions.map((category) => (
            <TabsTrigger
              key={category.id}
              value={category.id}
              className="rounded-lg px-3 py-1 text-sm font-medium transition-colors data-[state=active]:bg-[color:var(--jade-4)] data-[state=active]:text-[color:var(--jade-12)]"
            >
              <Flex align="center" gap="2">
                <span>{category.label}</span>
                <Badge variant="soft" color="gray" aria-hidden="true">
                  {sessionsByCategory[category.id]?.length ?? 0}
                </Badge>
              </Flex>
            </TabsTrigger>
          ))}
        </TabsList>

      </Flex>

      {categoryDefinitions.map((category) => {
        const categorySessions = sessionsByCategory[category.id] ?? [];

        return (
          <TabsContent key={category.id} value={category.id} className="mt-1 outline-none">
            <ScrollArea type="always" className="max-h-40">
              {categorySessions.length === 0 ? (
                <Text size="2" color="gray">
                  No sessions in this category yet.
                </Text>
              ) : (
                <div className="relative">
                  <Flex
                    ref={tabListRef}
                    role="tablist"
                    aria-orientation="horizontal"
                    aria-label={SESSION_TABLIST_ARIA_LABEL}
                    gap="2"
                    wrap="wrap"
                    className="relative"
                    data-testid="session-tablist"
                  >
                    <span
                      ref={indicatorRef}
                      data-testid="session-tab-indicator"
                      data-animated="true"
                      className="pointer-events-none absolute z-0 rounded-lg bg-[var(--jade-4)] transition-transform duration-300 ease-out"
                      style={{
                        transition: indicatorTransitionStyle,
                        transform: 'translate3d(0, 0, 0)',
                        opacity: 0,
                      }}
                    />
                    {categorySessions.map(renderSession)}
                  </Flex>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        );
      })}
    </TabsRoot>
  );
}
