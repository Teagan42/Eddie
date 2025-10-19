import { Badge, Flex, Heading, ScrollArea, Text } from "@radix-ui/themes";
import { useEffect, useMemo, useRef } from "react";

import type { OverviewMessage, OverviewSessionSummary } from "./types";

const SESSION_TITLE_CLASS = "text-[color:var(--overview-panel-foreground)]";
const MUTED_TEXT_CLASS = "text-[color:var(--overview-panel-muted)]";

const MESSAGE_CONTAINER_CLASS = [
  "relative h-64 overflow-hidden rounded-2xl border p-4",
  "border-[color:var(--overview-panel-border)]",
  "bg-[color:var(--overview-panel-bg)]",
  "shadow-[var(--overview-panel-shadow)]",
].join(" ");

const MESSAGE_OVERLAY_CLASS =
  "pointer-events-none absolute inset-0 bg-[var(--overview-message-overlay)]";

const MESSAGE_LIST_CLASS = "relative z-10 flex flex-col gap-3";

const MESSAGE_CARD_CLASS = [
  "relative gap-2 rounded-2xl border p-4",
  "border-[color:var(--overview-message-border)]",
  "bg-[color:var(--overview-message-bg)]",
  "shadow-[var(--overview-message-shadow)]",
].join(" ");

const MESSAGE_HEADER_CLASS =
  "flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[color:var(--overview-message-label)]";

const MESSAGE_HEADING_WRAPPER_CLASS = "inline-flex items-center gap-2";
const MESSAGE_DOT_CLASS = "h-2 w-2 rounded-full bg-[color:var(--overview-message-accent)]";
const MESSAGE_TIMESTAMP_CLASS = "text-[0.7rem] text-[color:var(--overview-message-timestamp)]";
const MESSAGE_BODY_CLASS = "text-[color:var(--overview-panel-foreground)]";
const MESSAGE_GLOW_CLASS =
  "pointer-events-none absolute -left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 rounded-full bg-[color:var(--overview-message-glow)] blur-2xl md:block";
const MESSAGE_BADGE_CLASS =
  "self-start text-[0.65rem] uppercase tracking-wider bg-[color:var(--overview-message-badge-bg)] text-[color:var(--overview-message-badge-fg)]";

export interface SessionDetailProps {
  session: OverviewSessionSummary | null;
  messages: OverviewMessage[] | undefined;
  isLoading: boolean;
}

export function SessionDetail({ session, messages, isLoading }: SessionDetailProps): JSX.Element {
  return (
    <Flex direction="column" gap="4">
      <Heading as="h3" size="4" className={SESSION_TITLE_CLASS}>
        {session?.title ?? "Select a session"}
      </Heading>

      {isLoading ? (
        <Text size="2" className={MUTED_TEXT_CLASS}>
          Loading messages…
        </Text>
      ) : messages ? (
        <MessagesList messages={messages} />
      ) : null}
    </Flex>
  );
}

interface StreamMessageAgentMetadata {
  id?: string | null;
  name?: string | null;
}

interface StreamMessageMetadata {
  agent?: StreamMessageAgentMetadata | null;
}

type StreamAwareMessage = OverviewMessage & {
  metadata?: StreamMessageMetadata | null;
};

function deriveCompletedMessages(messages: OverviewMessage[]): StreamAwareMessage[] {
  const completed: StreamAwareMessage[] = [];
  const partials = new Map<string, StreamAwareMessage>();

  for (const candidate of messages as StreamAwareMessage[]) {
    const eventType = typeof candidate.event === "string" ? candidate.event : null;

    if (eventType && eventType !== "end") {
      const previous = partials.get(candidate.id);
      partials.set(candidate.id, previous ? { ...previous, ...candidate } : { ...candidate });
      continue;
    }

    if (eventType === "end") {
      const base = partials.get(candidate.id);
      const merged: StreamAwareMessage = { ...(base ?? {}), ...candidate };
      if (!merged.content && base?.content) {
        merged.content = base.content;
      }
      completed.push(merged);
      partials.delete(candidate.id);
      continue;
    }

    completed.push(candidate);
  }

  return completed;
}

function getMessageHeading(message: StreamAwareMessage): string {
  const metadata = message.metadata;

  if (metadata && typeof metadata === "object") {
    const agent = metadata.agent;

    if (agent && typeof agent === "object") {
      const name = getNonEmptyLabel(agent.name);
      if (name) {
        return name;
      }

      const id = getNonEmptyLabel(agent.id);
      if (id) {
        return id;
      }
    }
  }

  const messageName = getNonEmptyLabel(message.name);
  return messageName ?? message.role;
}

function getNonEmptyLabel(candidate: unknown): string | null {
  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessagesList({ messages }: { messages: OverviewMessage[] }): JSX.Element {
  const completedMessages = useMemo(
    () => deriveCompletedMessages(messages),
    [messages]
  );
  const lastMessageMarkerRef = useRef<HTMLDivElement | null>(null);
  const lastMessage =
    completedMessages.length > 0 ? completedMessages[completedMessages.length - 1]! : null;
  const lastMessageId = lastMessage?.id ?? null;
  const lastMessageContent = lastMessage?.content ?? null;

  useEffect(() => {
    if (!lastMessageId) {
      return;
    }

    const node = lastMessageMarkerRef.current;

    if (!node || typeof node.scrollIntoView !== "function") {
      return;
    }

    node.scrollIntoView({ block: "end" });
  }, [lastMessageId, lastMessageContent]);

  return (
    <ScrollArea
      type="always"
      className={MESSAGE_CONTAINER_CLASS}
    >
      <div className={MESSAGE_OVERLAY_CLASS} aria-hidden />
      <Flex direction="column" gap="3" className={MESSAGE_LIST_CLASS}>
        {completedMessages.length === 0 ? (
          <Text size="2" className={MUTED_TEXT_CLASS}>
            No messages yet. Send the first message to kick off the session.
          </Text>
        ) : (
          completedMessages.map((message, index) => (
            <Flex
              key={message.id}
              direction="column"
              className={MESSAGE_CARD_CLASS}
              data-testid="message-card"
            >
              <Flex className={MESSAGE_HEADER_CLASS}>
                <span className={MESSAGE_HEADING_WRAPPER_CLASS}>
                  <span className={MESSAGE_DOT_CLASS} />
                  {getMessageHeading(message)}
                </span>
                <span className={MESSAGE_TIMESTAMP_CLASS}>{formatTimestamp(message.createdAt)}</span>
              </Flex>
              <Text size="2" className={MESSAGE_BODY_CLASS}>
                {message.content}
              </Text>
              <span className={MESSAGE_GLOW_CLASS} aria-hidden />
              <Badge radius="full" variant="soft" color="grass" className={MESSAGE_BADGE_CLASS}>
                #{index + 1}
              </Badge>
            </Flex>
          ))
        )}
        <div ref={lastMessageMarkerRef} aria-hidden />
      </Flex>
    </ScrollArea>
  );
}
