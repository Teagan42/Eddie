import {
  Badge,
  Button,
  DropdownMenu,
  Flex,
  IconButton,
  ScrollArea,
  Text,
} from "@radix-ui/themes";
import {
  CardStackIcon,
  ChatBubbleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DotsHorizontalIcon,
} from "@radix-ui/react-icons";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentProps,
  type KeyboardEvent,
} from "react";

import type { ChatSession } from "./types";

export const SESSION_TABLIST_ARIA_LABEL = "Chat sessions";

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
  clip: "rect(0 0 0 0)",
  height: 1,
  margin: -1,
  overflow: "hidden",
  padding: 0,
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
};

const indicatorTransitionStyle =
  "transform 300ms ease, width 300ms ease, height 300ms ease";

type DropdownMenuTriggerComponent = (
  props: ComponentProps<typeof DropdownMenu.Trigger> & { asChild?: boolean },
) => JSX.Element;

const DropdownMenuTrigger = DropdownMenu.Trigger as unknown as DropdownMenuTriggerComponent;

function createMetricsSignature(
  metrics: SessionSelectorMetricsSummary | undefined,
): string {
  if (!metrics) {
    return "";
  }

  const values: Array<number | string> = [
    typeof metrics.messageCount === "number" ? metrics.messageCount : "",
    typeof metrics.agentCount === "number" ? metrics.agentCount : "",
    typeof metrics.contextBundleCount === "number"
      ? metrics.contextBundleCount
      : "",
  ];

  return values.join("|");
}

function formatMetricCount(
  count: number | null | undefined,
  singular: string,
  plural: string,
): string | null {
  if (typeof count !== "number") {
    return null;
  }

  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function createMetricBadges(
  session: SessionSelectorSession,
): { badges: SessionMetricBadge[]; description: string } {
  const formattedMetrics: SessionMetricBadge[] = [];
  const metrics = session.metrics;

  if (metrics) {
    if (typeof metrics.messageCount === "number") {
      const messageLabel = formatMetricCount(
        metrics.messageCount,
        "message",
        "messages",
      );
      if (messageLabel) {
        formattedMetrics.push({
          id: "messages",
          ariaLabel: messageLabel,
          displayValue: `${metrics.messageCount}`,
          icon: <ChatBubbleIcon aria-hidden="true" />,
        });
      }
    }

    const agentLabel = formatMetricCount(metrics.agentCount, "agent", "agents");
    if (agentLabel) {
      formattedMetrics.push({
        id: "agents",
        ariaLabel: agentLabel,
        displayValue: agentLabel,
      });
    }

    if (typeof metrics.contextBundleCount === "number") {
      const bundleLabel = formatMetricCount(
        metrics.contextBundleCount,
        "bundle",
        "bundles",
      );
      if (bundleLabel) {
        formattedMetrics.push({
          id: "bundles",
          ariaLabel: bundleLabel,
          displayValue: `${metrics.contextBundleCount}`,
          icon: <CardStackIcon aria-hidden="true" />,
        });
      }
    }
  }

  const description = formattedMetrics
    .map((item) => item.ariaLabel)
    .join(", ");

  return { badges: formattedMetrics, description };
}

export type SessionSelectorSession = Pick<
  ChatSession,
  "id" | "title" | "status"
> & {
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

function cn(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
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
  const [highlightedSessionId, setHighlightedSessionId] =
    useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const listId = useId();
  const sessionIds = useMemo(() => sessions.map((session) => session.id), [
    sessions,
  ]);
  const sessionIdsSignature = useMemo(
    () => sessionIds.join("|"),
    [sessionIds],
  );

  const clearHighlightTimeout = useCallback(() => {
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, []);

  const registerTabItem = useCallback(
    (sessionId: string, element: HTMLDivElement | null) => {
      if (element) {
        tabItemRefs.current.set(sessionId, element);
      } else {
        tabItemRefs.current.delete(sessionId);
      }
    },
    [],
  );

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

    if (!selectedSessionId || isCollapsed) {
      indicator.style.opacity = "0";
      return;
    }

    const selectedItem = tabItemRefs.current.get(selectedSessionId);
    if (!selectedItem) {
      indicator.style.opacity = "0";
      return;
    }

    const listRect = list.getBoundingClientRect();
    const itemRect = selectedItem.getBoundingClientRect();

    indicator.style.opacity = "1";
    indicator.style.width = `${itemRect.width}px`;
    indicator.style.height = `${itemRect.height}px`;
    indicator.style.transform = `translate3d(${itemRect.left - listRect.left}px, ${
      itemRect.top - listRect.top
    }px, 0)`;
  }, [isCollapsed, selectedSessionId]);

  useEffect(() => {
    return () => {
      clearHighlightTimeout();
    };
  }, [clearHighlightTimeout]);

  useEffect(() => {
    window.addEventListener("resize", updateIndicatorPosition);

    return () => {
      window.removeEventListener("resize", updateIndicatorPosition);
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
          setHighlightedSessionId((current) =>
            current === session.id ? null : current,
          );
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
  }, [updateIndicatorPosition, sessionIdsSignature, isCollapsed]);

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
        case "ArrowRight":
        case "ArrowDown": {
          event.preventDefault();
          const nextIndex = (currentIndex + 1) % sessionIds.length;
          targetId = sessionIds[nextIndex];
          break;
        }
        case "ArrowLeft":
        case "ArrowUp": {
          event.preventDefault();
          const nextIndex = (currentIndex - 1 + sessionIds.length) % sessionIds.length;
          targetId = sessionIds[nextIndex];
          break;
        }
        case "Home": {
          event.preventDefault();
          targetId = sessionIds[0] ?? null;
          break;
        }
        case "End": {
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

  const baseToggleLabel = isCollapsed ? "Expand session list" : "Collapse session list";
  const sessionCountLabel = formatMetricCount(
    sessions.length,
    "session",
    "sessions",
  );
  const toggleLabel = sessionCountLabel
    ? `${baseToggleLabel} (${sessionCountLabel})`
    : baseToggleLabel;
  const ToggleIcon = isCollapsed ? ChevronDownIcon : ChevronUpIcon;

  const renderSession = (session: SessionSelectorSession): JSX.Element => {
    const isSelected = session.id === selectedSessionId;
    const { badges: formattedMetrics, description: metricsDescription } =
      createMetricBadges(session);
    const metricsDescriptionId = metricsDescription
      ? `${session.id}-metrics-description`
      : undefined;
    const isHighlighted = isSelected && highlightedSessionId === session.id;
    const menuTriggerLabel = `Session options for ${session.title}`;

    const selectedState = isSelected ? "true" : undefined;

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
          variant={isSelected ? "solid" : "soft"}
          color={isSelected ? "jade" : "gray"}
          onClick={() => onSelectSession(session.id)}
          role="tab"
          aria-selected={isSelected ? "true" : "false"}
          aria-label={session.title}
          aria-describedby={metricsDescriptionId}
          data-selected={selectedState}
          tabIndex={isSelected ? 0 : -1}
          onKeyDown={(event) => handleNavigationKeyDown(event, session.id)}
          ref={(element) => {
            registerTabTrigger(session.id, element);
          }}
          className={cn("relative z-10", isSelected ? undefined : "bg-transparent")}
        >
          <Flex align="center" gap="2">
            <span>{session.title}</span>
            {session.status === "archived" ? (
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
                  data-highlighted={isHighlighted ? "true" : undefined}
                >
                  {formattedMetrics.map((item) => (
                    <Badge
                      key={item.id}
                      variant="soft"
                      color="gray"
                      aria-label={item.ariaLabel}
                      title={item.ariaLabel}
                      data-has-icon={item.icon ? "true" : undefined}
                    >
                      <Flex align="center" gap="1" aria-hidden="true">
                        {item.icon ? (
                          <span className="text-[var(--gray-12)]">{item.icon}</span>
                        ) : null}
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
          <DropdownMenuTrigger asChild>
            <IconButton
              variant="ghost"
              color="gray"
              size="1"
              aria-label={menuTriggerLabel}
              title={menuTriggerLabel}
            >
              <DotsHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenu.Content align="end">
            <DropdownMenu.Item onSelect={() => onRenameSession(session.id)}>
              Rename session
            </DropdownMenu.Item>
            <DropdownMenu.Item
              color="ruby"
              onSelect={() => onDeleteSession(session.id)}
            >
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
          aria-expanded={isCollapsed ? "false" : "true"}
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
          {sessions.length === 0 ? (
            <Text size="2" color="gray">
              No sessions yet.
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
                    transform: "translate3d(0, 0, 0)",
                    opacity: 0,
                  }}
                />
                {sessions.map(renderSession)}
              </Flex>
            </div>
          )}
        </ScrollArea>
      )}
    </Flex>
  );
}
