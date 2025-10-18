import { Badge, Flex, Heading, ScrollArea, Text } from "@radix-ui/themes";
import type { ChatMessageDto, ChatSessionDto } from "@eddie/api-client";
import { useEffect, useMemo, useRef } from "react";
import type { ComponentProps } from "react";

export interface SessionDetailProps {
  session: ChatSessionDto | null;
  messages: ChatMessageDto[] | undefined;
  isLoading: boolean;
}

export function SessionDetail({ session, messages, isLoading }: SessionDetailProps): JSX.Element {
  return (
    <Flex direction="column" gap="4">
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

type StreamEventLike = {
  type: string;
  text?: string;
  content?: string;
  timestamp?: string;
  createdAt?: string;
  agent?: { id?: string | null; name?: string | null; role?: ChatMessageDto["role"] | null };
  agentId?: string | null;
  role?: ChatMessageDto["role"];
  name?: string | null;
};

type MessageWithEvents = ChatMessageDto & { events?: StreamEventLike[] };

interface RenderableMessage {
  id: string;
  role: ChatMessageDto["role"];
  agentName: string;
  createdAt: string;
  content: string;
}

const ROLE_INDICATOR_CLASS: Record<ChatMessageDto["role"], string> = {
  user: "bg-emerald-400",
  assistant: "bg-sky-400",
  system: "bg-amber-400",
  tool: "bg-violet-400",
};

const ROLE_BADGE_COLOR: Record<ChatMessageDto["role"], ComponentProps<typeof Badge>["color"]> = {
  user: "jade",
  assistant: "grass",
  system: "plum",
  tool: "iris",
};

function MessagesList({ messages }: { messages: ChatMessageDto[] }): JSX.Element {
  const lastMessageMarkerRef = useRef<HTMLDivElement | null>(null);
  const renderableMessages = useMemo(
    () => messages.flatMap((message) => expandRenderableMessages(message)),
    [messages],
  );
  const lastMessage =
    renderableMessages.length > 0 ? renderableMessages[renderableMessages.length - 1]! : null;
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
      className="relative h-64 overflow-hidden rounded-2xl border border-white/15 bg-white/12 p-4"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),transparent_65%)]"
        aria-hidden
      />
      <Flex direction="column" gap="3" className="relative z-10">
        {renderableMessages.length === 0 ? (
          <Text size="2" color="gray">
            No messages yet. Send the first message to kick off the session.
          </Text>
        ) : (
          renderableMessages.map((message, index) => {
            const timestampLabel = formatTimestamp(message.createdAt);

            return (
              <Flex
                key={message.id}
                direction="column"
                className="relative gap-2 rounded-2xl border border-white/15 bg-slate-900/55 p-4 shadow-[0_25px_65px_-55px_rgba(59,130,246,0.7)]"
                data-testid="session-detail-message-card"
              >
                <Flex align="center" justify="between" className="items-start">
                  <span className="inline-flex items-center gap-3">
                    <span
                      className={`mt-1 h-2.5 w-2.5 rounded-full ${
                        ROLE_INDICATOR_CLASS[message.role] ?? "bg-emerald-400"
                      }`}
                    />
                    <Heading as="h4" size="3" className="text-white">
                      {message.agentName}
                    </Heading>
                  </span>
                  {timestampLabel ? (
                    <span className="text-xs uppercase tracking-[0.2em] text-white/60">
                      {timestampLabel}
                    </span>
                  ) : null}
                </Flex>
                <Text size="2" className="text-white/90">
                  {message.content}
                </Text>
                <span
                  className="pointer-events-none absolute -left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-2xl md:block"
                  aria-hidden
                />
                <Badge
                  radius="full"
                  variant="soft"
                  color={ROLE_BADGE_COLOR[message.role] ?? "grass"}
                  className="self-start text-[0.65rem] uppercase tracking-wider"
                >
                  #{index + 1}
                </Badge>
              </Flex>
            );
          })
        )}
        <div ref={lastMessageMarkerRef} aria-hidden />
      </Flex>
    </ScrollArea>
  );
}

function expandRenderableMessages(message: ChatMessageDto): RenderableMessage[] {
  const events = (message as MessageWithEvents).events;

  if (!Array.isArray(events) || events.length === 0) {
    return [buildRenderableFromMessage(message, 0)];
  }

  const renderable: RenderableMessage[] = [];
  let buffer = "";
  let sequence = 0;
  let currentAgent: AgentInfo | undefined;
  let currentRole: ChatMessageDto["role"] = message.role;
  let currentTimestamp: string | undefined;

  for (const event of events) {
    if (!event || typeof event.type !== "string") {
      continue;
    }

    if (event.type === "start") {
      currentAgent = normalizeAgentInfo(event);
      currentRole = currentAgent?.role ?? currentRole ?? message.role;
      currentTimestamp = event.timestamp ?? event.createdAt ?? currentTimestamp;
      buffer = "";
      continue;
    }

    if (event.type === "delta") {
      const delta = resolveEventText(event);
      if (delta) {
        buffer += delta;
      }
      currentTimestamp = event.timestamp ?? event.createdAt ?? currentTimestamp;
      continue;
    }

    if (event.type === "end") {
      const agentInfo = normalizeAgentInfo(event) ?? currentAgent;
      const content = buffer || resolveEventText(event) || message.content;
      const createdAt =
        event.timestamp ?? event.createdAt ?? currentTimestamp ?? message.createdAt;

      renderable.push(
        buildRenderableFromMessage(
          message,
          sequence,
          agentInfo ?? { role: currentRole },
          content,
          createdAt,
        ),
      );

      sequence += 1;
      buffer = "";
      currentAgent = undefined;
      currentRole = message.role;
      currentTimestamp = undefined;
    }
  }

  if (renderable.length === 0) {
    renderable.push(buildRenderableFromMessage(message, 0));
  }

  return renderable;
}

interface AgentInfo {
  id?: string | null;
  name?: string | null;
  role?: ChatMessageDto["role"] | null;
}

function normalizeAgentInfo(event: StreamEventLike | undefined): AgentInfo | undefined {
  if (!event) {
    return undefined;
  }

  if (event.agent) {
    return {
      id: event.agent.id ?? undefined,
      name: event.agent.name ?? undefined,
      role: event.agent.role ?? undefined,
    };
  }

  const name = typeof event.name === "string" ? event.name : undefined;
  const role = event.role ?? undefined;
  const id = event.agentId ?? undefined;

  if (name || role || id) {
    return { id, name, role };
  }

  return undefined;
}

function resolveAgentName(agent: AgentInfo | undefined, message: ChatMessageDto): string {
  if (agent?.name) {
    return agent.name;
  }

  if (message.name) {
    return message.name;
  }

  return formatRoleLabel(agent?.role ?? message.role);
}

function buildRenderableFromMessage(
  message: ChatMessageDto,
  sequence: number,
  agent?: AgentInfo,
  content?: string,
  createdAt?: string,
): RenderableMessage {
  const resolvedAgent = agent ?? { role: message.role };

  return {
    id: `${message.id}:${sequence}`,
    role: resolvedAgent.role ?? message.role,
    agentName: resolveAgentName(resolvedAgent, message),
    createdAt: createdAt ?? message.createdAt,
    content: content ?? message.content,
  };
}

function resolveEventText(event: StreamEventLike | undefined): string {
  if (!event) {
    return "";
  }

  if (typeof event.text === "string" && event.text.trim().length > 0) {
    return event.text;
  }

  if (typeof event.content === "string" && event.content.trim().length > 0) {
    return event.content;
  }

  const delta = (event as { delta?: string | { text?: string } }).delta;
  if (typeof delta === "string" && delta.trim().length > 0) {
    return delta;
  }
  if (typeof delta === "object" && delta && typeof delta.text === "string") {
    return delta.text;
  }

  return "";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatRoleLabel(role: ChatMessageDto["role"] | null | undefined): string {
  if (!role) {
    return "";
  }

  return role
    .split(/[_-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
