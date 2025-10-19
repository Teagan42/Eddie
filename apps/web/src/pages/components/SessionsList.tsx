import { Flex, Heading, ScrollArea, Text } from "@radix-ui/themes";
import type { ChatSessionDto } from "@eddie/api-client";
import { cn } from "@/vendor/lib/utils";

const LIST_SURFACE_CLASS = cn(
  "h-80 rounded-2xl border p-3",
  "border-[color:var(--overview-panel-border)]",
  "bg-[color:var(--overview-panel-bg)]",
  "shadow-[var(--overview-panel-shadow)]"
);

const ITEM_BASE_CLASS = "rounded-2xl border px-4 py-3 text-left transition-all";

const INACTIVE_ITEM_CLASS = cn(
  ITEM_BASE_CLASS,
  "border-[color:var(--overview-panel-item-border)]",
  "bg-[color:var(--overview-panel-item-bg)]",
  "text-[color:var(--overview-panel-muted)]",
  "shadow-[var(--overview-panel-item-shadow)]",
  "hover:-translate-y-0.5",
  "hover:border-[color:var(--hero-outline-border)]",
  "hover:bg-[color:var(--hero-outline-bg-hover)]",
  "hover:text-[color:var(--overview-panel-foreground)]",
  "hover:shadow-[var(--hero-cta-shadow)]"
);

const ACTIVE_ITEM_CLASS = cn(
  ITEM_BASE_CLASS,
  "border-[color:var(--hero-outline-border)]",
  "bg-[color:var(--hero-outline-bg)]",
  "text-[color:var(--overview-panel-foreground)]",
  "shadow-[var(--hero-cta-shadow)]"
);

const MUTED_TEXT_CLASS = "text-[color:var(--overview-panel-muted)]";

export interface SessionsListProps {
  sessions: ChatSessionDto[] | undefined;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export function SessionsList({
  sessions,
  selectedSessionId,
  onSelectSession,
}: SessionsListProps): JSX.Element {
  return (
    <ScrollArea
      type="always"
      className={LIST_SURFACE_CLASS}
      data-testid="sessions-list"
    >
      <Flex direction="column" gap="2">
        {sessions?.length ? (
          sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelectSession(session.id)}
              className={session.id === selectedSessionId ? ACTIVE_ITEM_CLASS : INACTIVE_ITEM_CLASS}
            >
              <Heading
                as="h3"
                size="3"
                weight="medium"
                className="text-[color:var(--overview-panel-foreground)]"
              >
                {session.title}
              </Heading>
              <Text size="1" className={MUTED_TEXT_CLASS}>
                Updated {new Date(session.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </button>
          ))
        ) : (
          <Text size="2" className={MUTED_TEXT_CLASS}>
            No sessions yet. Create one to get started.
          </Text>
        )}
      </Flex>
    </ScrollArea>
  );
}
