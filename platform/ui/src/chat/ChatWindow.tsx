import type { FormEventHandler, ReactNode } from "react";
import { Badge, Card, Flex, Heading, Separator, Text } from "@radix-ui/themes";

import { MessageComposer } from "./MessageComposer";

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp?: string;
}

export interface SessionMetrics {
  tokensConsumed: number;
  latencyMs: number;
  toolInvocations: number;
}

export interface ChatWindowProps {
  heading?: ReactNode;
  messages: ChatMessage[];
  sessionMetrics?: SessionMetrics;
  composerValue: string;
  onComposerValueChange: (value: string) => void;
  onComposerSubmit: FormEventHandler<HTMLFormElement>;
  composerDisabled?: boolean;
  composerPlaceholder?: string;
  composerSubmitDisabled?: boolean;
  emptyState?: ReactNode;
  errorState?: ReactNode;
}

const ROLE_BADGE_VARIANTS: Record<ChatRole, "sky" | "orange" | "gray"> = {
  user: "sky",
  assistant: "orange",
  system: "gray",
};

export function ChatWindow({
  heading = "Conversation",
  messages,
  sessionMetrics,
  composerValue,
  onComposerValueChange,
  onComposerSubmit,
  composerDisabled = false,
  composerPlaceholder,
  composerSubmitDisabled = false,
  emptyState = <Text size="2">No messages yet. Start the conversation below.</Text>,
  errorState,
}: ChatWindowProps): JSX.Element {
  const hasMessages = messages.length > 0;

  return (
    <Flex direction="column" gap="5" className="w-full max-w-3xl">
      <Flex direction="column" gap="2">
        <Heading as="h2" size="5" weight="bold">
          {heading}
        </Heading>
        {sessionMetrics ? <SessionMetricsSummary metrics={sessionMetrics} /> : null}
      </Flex>

      <Card className="max-h-80 overflow-y-auto border border-[color:var(--overview-panel-item-border)] bg-[color:var(--overview-panel-item-bg)]">
        <Flex direction="column" gap="4" p="4">
          {errorState}
          {!errorState && hasMessages
            ? messages.map((message) => <MessageRow key={message.id} message={message} />)
            : null}
          {!errorState && !hasMessages ? emptyState : null}
        </Flex>
      </Card>

      <MessageComposer
        disabled={composerDisabled}
        value={composerValue}
        onChange={onComposerValueChange}
        onSubmit={onComposerSubmit}
        placeholder={composerPlaceholder}
        submitDisabled={composerSubmitDisabled}
      />
    </Flex>
  );
}

function SessionMetricsSummary({ metrics }: { metrics: SessionMetrics }): JSX.Element {
  return (
    <Flex gap="3" wrap="wrap">
      <MetricCard label="Tokens" value={metrics.tokensConsumed} />
      <MetricCard label="Latency" value={`${metrics.latencyMs} ms`} />
      <MetricCard label="Tools" value={metrics.toolInvocations} />
    </Flex>
  );
}

function MessageRow({ message }: { message: ChatMessage }): JSX.Element {
  return (
    <Flex direction="column" gap="2">
      <Badge variant="soft" color={ROLE_BADGE_VARIANTS[message.role]} size="1">
        {message.role}
      </Badge>
      <Text size="2">{message.content}</Text>
      {message.timestamp ? (
        <Text size="1" color="gray">
          {message.timestamp}
        </Text>
      ) : null}
      <Separator size="4" />
    </Flex>
  );
}

function MetricCard({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <Card className="border border-[color:var(--overview-panel-item-border)] bg-[color:var(--overview-panel-item-bg)] px-3 py-2">
      <Text size="1" color="gray">
        {label}
      </Text>
      <Text size="3" weight="medium">
        {value}
      </Text>
    </Card>
  );
}
