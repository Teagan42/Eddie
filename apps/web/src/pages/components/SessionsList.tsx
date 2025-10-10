import { Flex, Heading, ScrollArea, Text } from "@radix-ui/themes";
import type { ChatSessionDto } from "@eddie/api-client";
import { cn } from "@/components/lib/utils";

export interface SessionsListProps {
  sessions: ChatSessionDto[] | undefined;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  className?: string;
}

export function SessionsList({
  sessions,
  selectedSessionId,
  onSelectSession,
  className,
}: SessionsListProps): JSX.Element {
  return (
    <div className={cn("h-full", className)} data-testid="sessions-scroll-area">
      <ScrollArea
        type="always"
        aria-label="Chat sessions list"
        className="h-full rounded-2xl border border-white/15 bg-slate-900/35 p-3"
      >
        <Flex direction="column" gap="2">
          {sessions?.length ? (
            sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={cn(
                  "rounded-2xl border border-white/10 px-4 py-3 text-left transition-all",
                  session.id === selectedSessionId
                    ? "bg-emerald-500/25 text-white shadow-[0_18px_45px_-28px_rgba(16,185,129,0.8)]"
                    : "bg-white/10 text-white/80 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-500/20 hover:text-white"
                )}
              >
                <Heading as="h3" size="3" weight="medium">
                  {session.title}
                </Heading>
                <Text size="1" color="gray">
                  Updated {new Date(session.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </button>
            ))
          ) : (
            <Text size="2" color="gray">
              No sessions yet. Create one to get started.
            </Text>
          )}
        </Flex>
      </ScrollArea>
    </div>
  );
}
