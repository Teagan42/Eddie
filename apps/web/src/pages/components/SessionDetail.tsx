import { Badge, Flex, Heading, ScrollArea, Text } from "@radix-ui/themes";
import type { ChatMessageDto, ChatSessionDto } from "@eddie/api-client";
import { useEffect, useRef } from "react";

export interface SessionDetailProps {
  session: ChatSessionDto | null;
  messages: ChatMessageDto[] | undefined;
  isLoading: boolean;
}

export function SessionDetail({ session, messages, isLoading }: SessionDetailProps): JSX.Element {
  return (
    <Flex direction="column" gap="4" className="min-h-[16rem] flex-1">
      <Heading as="h3" size="4" className="text-white">
        {session?.title ?? "Select a session"}
      </Heading>

      {isLoading ? (
        <Text size="2" color="gray">
          Loading messages…
        </Text>
      ) : messages ? (
        <MessagesList messages={messages} />
      ) : null}
    </Flex>
  );
}

function MessagesList({ messages }: { messages: ChatMessageDto[] }): JSX.Element {
  const lastMessageMarkerRef = useRef<HTMLDivElement | null>(null);
  const lastMessage = messages.length > 0 ? messages[messages.length - 1]! : null;
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
    <div className="flex-1" data-testid="session-messages-scroll-area">
      <ScrollArea
        type="always"
        aria-label="Session messages"
        className="relative h-full min-h-[16rem] overflow-hidden rounded-2xl border border-white/15 bg-white/12 p-4"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_65%)]"
          aria-hidden
        />
        <Flex direction="column" gap="3" className="relative z-10">
          {messages.length === 0 ? (
            <Text size="2" color="gray">
              No messages yet. Send the first message to kick off the session.
            </Text>
          ) : (
            messages.map((message, index) => (
              <Flex
                key={message.id}
                direction="column"
                className="relative gap-2 rounded-2xl border border-white/15 bg-slate-900/55 p-4 shadow-[0_25px_65px_-55px_rgba(59,130,246,0.7)]"
              >
                <Flex align="center" justify="between" className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    {message.role}
                  </span>
                  <span className="text-[0.7rem] text-white/70">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </Flex>
                <Text size="2" className="text-white/90">
                  {message.content}
                </Text>
                <span
                  className="pointer-events-none absolute -left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-2xl md:block"
                  aria-hidden
                />
                <Badge radius="full" variant="soft" color="grass" className="self-start text-[0.65rem] uppercase tracking-wider">
                  #{index + 1}
                </Badge>
              </Flex>
            ))
          )}
          <div ref={lastMessageMarkerRef} aria-hidden />
        </Flex>
      </ScrollArea>
    </div>
  );
}
