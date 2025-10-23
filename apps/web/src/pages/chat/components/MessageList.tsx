import type {
  RefObject,
  ComponentProps,
  ComponentType,
  KeyboardEvent,
} from 'react';
import { Badge, Box, Flex, IconButton, ScrollArea, Text, Tooltip } from '@radix-ui/themes';
import {
  CodeIcon,
  CubeIcon,
  GearIcon,
  MagicWandIcon,
  PersonIcon,
  ReloadIcon,
} from '@radix-ui/react-icons';

import type { ChatMessageDto } from '@eddie/api-client';

import { cn } from '@/vendor/lib/utils';

import { ChatMessageContent } from '../ChatMessageContent';

const MESSAGE_CONTAINER_CLASS =
  'space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur-xl';

type MessageRole = ChatMessageDto['role'];

type BadgeColor = ComponentProps<typeof Badge>['color'];

type MessageRoleStyle = {
  label: string;
  badgeColor: BadgeColor;
  align: 'start' | 'end';
  cardClassName: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  contentClassName?: string;
};

const MESSAGE_ROLE_STYLES: Record<MessageRole, MessageRoleStyle> = {
  user: {
    label: 'User',
    badgeColor: 'blue',
    align: 'end',
    cardClassName:
      'border border-emerald-400/30 bg-gradient-to-br from-emerald-500/25 via-emerald-500/5 to-slate-950/70 text-emerald-50 shadow-[0_30px_60px_-35px_rgba(16,185,129,0.7)]',
    icon: PersonIcon,
    iconClassName: 'text-emerald-200',
    contentClassName: 'leading-relaxed text-white/95',
  },
  assistant: {
    label: 'Assistant',
    badgeColor: 'green',
    align: 'start',
    cardClassName:
      'border border-sky-400/30 bg-gradient-to-br from-sky-500/25 via-sky-500/5 to-slate-950/70 text-sky-50 shadow-[0_30px_60px_-35px_rgba(56,189,248,0.6)]',
    icon: MagicWandIcon,
    iconClassName: 'text-sky-200',
    contentClassName: 'leading-relaxed text-white/95',
  },
  developer: {
    label: 'Developer',
    badgeColor: 'indigo',
    align: 'start',
    cardClassName:
      'border border-indigo-400/30 bg-gradient-to-br from-indigo-500/25 via-indigo-500/5 to-slate-950/70 text-indigo-50 shadow-[0_30px_60px_-35px_rgba(99,102,241,0.65)]',
    icon: CodeIcon,
    iconClassName: 'text-indigo-200',
    contentClassName: 'text-sm font-mono text-indigo-50',
  },
  system: {
    label: 'Command',
    badgeColor: 'purple',
    align: 'start',
    cardClassName:
      'border border-amber-400/30 bg-gradient-to-br from-amber-500/25 via-amber-500/5 to-slate-950/70 text-amber-50 shadow-[0_30px_60px_-35px_rgba(250,204,21,0.55)]',
    icon: GearIcon,
    iconClassName: 'text-amber-200',
    contentClassName: 'text-sm font-mono text-amber-50',
  },
  tool: {
    label: 'Agent',
    badgeColor: 'amber',
    align: 'start',
    cardClassName:
      'border border-fuchsia-400/30 bg-gradient-to-br from-fuchsia-500/25 via-fuchsia-500/5 to-slate-950/70 text-fuchsia-50 shadow-[0_30px_60px_-35px_rgba(217,70,239,0.55)]',
    icon: CubeIcon,
    iconClassName: 'text-fuchsia-200',
    contentClassName: 'leading-relaxed text-white/95',
  },
};

const REASONING_STATUS_VARIANTS = {
  streaming: { label: 'Streaming', badge: 'blue' as BadgeColor },
  completed: { label: 'Completed', badge: 'green' as BadgeColor },
};

type AgentMetadata = {
  id?: string | null;
  name?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  lineage?: Array<
    | string
    | {
        id?: string | null;
        name?: string | null;
      }
  > | null;
};

type MessageMetadata = {
  agent?: AgentMetadata | null;
  tool?: {
    id?: string | null;
    name?: string | null;
    status?: string | null;
  } | null;
} | null;

type MessageReasoningSegment = {
  text?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  agentId?: string | null;
};

type MessageReasoning = {
  segments?: MessageReasoningSegment[];
  responseId?: string;
  status?: "streaming" | "completed";
} | null;

type MessageWithMetadata = ChatMessageDto & {
  metadata?: MessageMetadata;
  reasoning?: MessageReasoning;
};

export type MessageListItem = MessageWithMetadata;

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = getNonEmptyString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeLineageEntry(entry: unknown): string | null {
  if (typeof entry === 'string') {
    return getNonEmptyString(entry);
  }

  if (entry && typeof entry === 'object') {
    const candidate = entry as { id?: unknown; name?: unknown };
    return (
      getNonEmptyString(candidate.name) ?? getNonEmptyString(candidate.id)
    );
  }

  return null;
}

function getParentFromLineage(agent: AgentMetadata | null | undefined): string | null {
  if (!agent || !Array.isArray(agent.lineage)) {
    return null;
  }

  const normalized = agent.lineage
    .map((entry) => normalizeLineageEntry(entry))
    .filter((value): value is string => Boolean(value));

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length >= 2) {
    return normalized[normalized.length - 2] ?? null;
  }

  return normalized[0] ?? null;
}

function getMessageProvenance(
  message: MessageWithMetadata,
  fallbackLabel: string,
): { heading: string; subheading: string | null } {
  const metadata = message.metadata;

  if (metadata && typeof metadata === 'object') {
    const agent = metadata.agent;

    if (agent && typeof agent === 'object') {
      const headingCandidate = firstNonEmpty(
        agent.name,
        agent.id,
        message.name,
      );
      const subheadingCandidate = firstNonEmpty(
        agent.parentName,
        agent.parentId,
        getParentFromLineage(agent),
      );

      return {
        heading: headingCandidate ?? fallbackLabel,
        subheading: subheadingCandidate,
      };
    }
  }

  const heading = firstNonEmpty(message.name, fallbackLabel) ?? fallbackLabel;

  return { heading, subheading: null };
}

function formatTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type ToolStatus = 'pending' | 'running' | 'completed' | 'failed' | 'unknown';

const TOOL_STATUS_LABEL: Record<ToolStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  unknown: 'Unknown',
};

const TOOL_STATUS_BADGE: Record<ToolStatus, BadgeColor> = {
  pending: 'gray',
  running: 'blue',
  completed: 'green',
  failed: 'red',
  unknown: 'gray',
};

function normalizeToolStatus(value: unknown): ToolStatus {
  if (typeof value !== 'string') {
    return 'unknown';
  }

  const normalized = value.toLowerCase().trim();
  if (normalized === 'pending' || normalized === 'running' || normalized === 'completed' || normalized === 'failed') {
    return normalized;
  }

  return 'unknown';
}

function getToolSummary(
  message: MessageWithMetadata,
): { name: string; status: ToolStatus } {
  const metadata = message.metadata;
  const toolMetadata = metadata && typeof metadata === 'object' ? metadata.tool : null;
  const name =
    firstNonEmpty(toolMetadata?.name, message.name, toolMetadata?.id, message.toolCallId) ??
    'Tool invocation';
  const status = normalizeToolStatus(toolMetadata?.status);

  return { name, status };
}

function getToolInvocationId(message: MessageWithMetadata): string | null {
  const metadata = message.metadata;
  const toolMetadata = metadata && typeof metadata === 'object' ? metadata.tool : null;

  return (
    firstNonEmpty(
      message.toolCallId,
      toolMetadata && typeof toolMetadata === 'object' ? toolMetadata.id : null,
    ) ?? null
  );
}

function buildToolInvocationLabel(summary: { name: string; status: ToolStatus }): string {
  const statusLabel = TOOL_STATUS_LABEL[summary.status];
  return `${summary.name} tool invocation (${statusLabel})`;
}

function getReasoningAgentLabel(
  message: MessageWithMetadata,
  segment: MessageReasoningSegment | undefined,
): string | null {
  const agentMetadata = message.metadata?.agent ?? null;
  const metadataLabel = agentMetadata
    ? firstNonEmpty(agentMetadata.name, agentMetadata.id)
    : null;

  return metadataLabel ?? getNonEmptyString(segment?.agentId);
}

function getRenderableReasoningSegments(
  reasoning: MessageReasoning,
): Array<{ segment: MessageReasoningSegment; text: string }> {
  if (!reasoning || !Array.isArray(reasoning.segments)) {
    return [];
  }

  const segments: Array<{ segment: MessageReasoningSegment; text: string }> = [];

  for (const segment of reasoning.segments) {
    if (!segment || typeof segment.text !== 'string') {
      continue;
    }

    const trimmed = segment.text.trim();
    if (trimmed.length === 0) {
      continue;
    }

    segments.push({ segment, text: trimmed });
  }

  return segments;
}

function getReasoningAgentParentLabel(message: MessageWithMetadata): string | null {
  const agentMetadata = message.metadata?.agent ?? null;
  if (!agentMetadata) {
    return null;
  }

  return firstNonEmpty(
    agentMetadata.parentName,
    agentMetadata.parentId,
    getParentFromLineage(agentMetadata as AgentMetadata | null | undefined),
  );
}

export interface MessageListProps {
  messages: MessageWithMetadata[];
  onReissueCommand: (message: MessageListItem) => void;
  scrollAnchorRef: RefObject<HTMLDivElement>;
  onInspectToolInvocation?: (toolCallId: string | null) => void;
}

export function MessageList({
  messages,
  onReissueCommand,
  scrollAnchorRef,
  onInspectToolInvocation,
}: MessageListProps): JSX.Element {
  return (
    <ScrollArea type="always" className="h-96 rounded-xl border border-muted/40 bg-muted/10 p-4">
      <div role="log">
        <Flex direction="column" gap="4">
          {messages.length === 0 ? (
            <Text size="2" color="gray">
              No messages yet. Use the composer below to send your first command.
            </Text>
          ) : (
            messages.map((message) => {
              const roleStyle = MESSAGE_ROLE_STYLES[message.role];
              const {
                align,
                badgeColor,
                cardClassName,
                contentClassName,
                icon: Icon,
                iconClassName,
                label,
              } = roleStyle;
              const timestamp = formatTime(message.createdAt);
              const alignmentClass =
                align === 'end' ? 'ml-auto w-full max-w-2xl' : 'mr-auto w-full max-w-2xl';
              const containerClassName = cn(MESSAGE_CONTAINER_CLASS, cardClassName);
              const showReissueButton = message.role !== 'assistant';
              const fallbackHeading = message.role === 'user' ? 'You' : label;
              const messageWithMetadata = message as MessageWithMetadata;
              const { heading, subheading } = getMessageProvenance(
                messageWithMetadata,
                fallbackHeading,
              );
              const isToolMessage = message.role === 'tool';
              const toolSummary = isToolMessage
                ? getToolSummary(messageWithMetadata)
                : null;
              const toolInvocationId = isToolMessage
                ? getToolInvocationId(messageWithMetadata)
                : null;
              const reasoning = messageWithMetadata.reasoning ?? null;
              const reasoningSegments = getRenderableReasoningSegments(reasoning);
              const hasReasoning = reasoningSegments.length > 0;
              const reasoningStatus =
                reasoning?.status === 'completed' ? 'completed' : 'streaming';
              const reasoningVariant = REASONING_STATUS_VARIANTS[reasoningStatus];
              const reasoningParentLabel = getReasoningAgentParentLabel(
                messageWithMetadata,
              );

              return (
                <Box key={message.id} className={alignmentClass}>
                  <Box
                    className={cn(
                      containerClassName,
                      isToolMessage && onInspectToolInvocation
                        ? 'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-400 focus-visible:ring-offset-transparent'
                        : undefined,
                    )}
                    role={isToolMessage && onInspectToolInvocation ? 'button' : undefined}
                    tabIndex={isToolMessage && onInspectToolInvocation ? 0 : undefined}
                    aria-label={
                      isToolMessage && onInspectToolInvocation && toolSummary
                        ? buildToolInvocationLabel(toolSummary)
                        : undefined
                    }
                    onClick={() => {
                      if (!isToolMessage || !onInspectToolInvocation) {
                        return;
                      }
                      onInspectToolInvocation(toolInvocationId);
                    }}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                      if (!isToolMessage || !onInspectToolInvocation) {
                        return;
                      }
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onInspectToolInvocation(toolInvocationId);
                      }
                    }}
                  >
                    <Flex align="start" justify="between" gap="3">
                      <Flex align="start" gap="3" className="min-w-0">
                        <Box className="rounded-full bg-white/15 p-2 shadow-inner">
                          <Icon className={`h-4 w-4 ${roleStyle.iconClassName}`} />
                        </Box>
                        <Flex direction="column" gap="2" className="min-w-0">
                          <Flex direction="column" gap="1" className="min-w-0">
                            <Text size="2" className="font-medium text-white">
                              {heading}
                            </Text>
                            {subheading ? (
                              <Text size="1" color="gray" className="text-xs text-gray-300">
                                {subheading}
                              </Text>
                            ) : null}
                          </Flex>
                          <Flex align="center" gap="2" className="flex-wrap">
                            <Badge color={badgeColor} variant="soft">
                              {label}
                            </Badge>
                            {timestamp ? (
                              <Text size="1" color="gray">
                                {timestamp}
                              </Text>
                            ) : null}
                          </Flex>
                        </Flex>
                      </Flex>
                      {showReissueButton ? (
                        <Tooltip content="Re-issue command">
                          <IconButton
                            size="1"
                            variant="solid"
                            onClick={(event) => {
                              event.stopPropagation();
                              onReissueCommand(message);
                            }}
                            aria-label="Re-issue command"
                          >
                            <ReloadIcon className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </Flex>
                    {isToolMessage && toolSummary ? (
                      <Flex direction="column" gap="3" className="mt-4">
                        <Text size="3" weight="medium" className="text-white">
                          {toolSummary.name}
                        </Text>
                        <Badge color={TOOL_STATUS_BADGE[toolSummary.status]} variant="soft">
                          {TOOL_STATUS_LABEL[toolSummary.status]}
                        </Badge>
                      </Flex>
                    ) : (
                      <ChatMessageContent
                        messageRole={message.role}
                        content={message.content}
                        className={cn('text-base text-white', contentClassName)}
                      />
                    )}
                    {hasReasoning ? (
                      <Box
                        className="mt-4 space-y-2 rounded-xl border border-white/10 bg-white/5 p-4"
                        data-testid="chat-message-reasoning"
                      >
                        <Flex align="center" justify="between" className="flex-wrap gap-2">
                          <Text
                            size="1"
                            className="text-xs font-semibold uppercase tracking-wide text-slate-200/80"
                          >
                            Reasoning
                          </Text>
                          <Badge color={reasoningVariant.badge} variant="soft">
                            {reasoningVariant.label}
                          </Badge>
                        </Flex>
                        <Flex direction="column" gap="2" className="mt-2">
                          {reasoningSegments.map(({ segment, text }, index) => {
                            const agentLabel = getReasoningAgentLabel(
                              messageWithMetadata,
                              segment,
                            );
                            const segmentTimestamp = segment.timestamp
                              ? formatTime(segment.timestamp)
                              : null;

                            return (
                              <Box
                                key={`${segment.timestamp ?? index}-${message.id}`}
                                className="rounded-lg bg-slate-950/40 p-3"
                                data-testid="chat-message-reasoning-segment"
                              >
                                <Flex align="center" justify="between" className="flex-wrap gap-2">
                                  <Flex direction="column" gap="1">
                                    {agentLabel ? (
                                      <Text
                                        size="1"
                                        color="gray"
                                        className="text-xs uppercase tracking-wide text-slate-300"
                                      >
                                        Agent {agentLabel}
                                      </Text>
                                    ) : null}
                                    {reasoningParentLabel ? (
                                      <Text size="1" color="gray" className="text-xs text-slate-400">
                                        Reports to {reasoningParentLabel}
                                      </Text>
                                    ) : null}
                                  </Flex>
                                  {segmentTimestamp ? (
                                    <Text size="1" color="gray" className="text-xs text-slate-300">
                                      {segmentTimestamp}
                                    </Text>
                                  ) : null}
                                </Flex>
                                <Text size="2" className="mt-2 whitespace-pre-wrap text-slate-200">
                                  {text}
                                </Text>
                              </Box>
                            );
                          })}
                        </Flex>
                      </Box>
                    ) : null}
                  </Box>
                </Box>
              );
            })
          )}
          <div ref={scrollAnchorRef} data-testid="chat-scroll-anchor" aria-hidden="true" />
        </Flex>
      </div>
    </ScrollArea>
  );
}
