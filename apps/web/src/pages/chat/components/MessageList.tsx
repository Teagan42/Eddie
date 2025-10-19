import type { RefObject, ComponentProps, ComponentType } from 'react';
import { Badge, Box, Flex, IconButton, ScrollArea, Text, Tooltip } from '@radix-ui/themes';
import { GearIcon, MagicWandIcon, PersonIcon, ReloadIcon } from '@radix-ui/react-icons';

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
};

function formatTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export interface MessageListProps {
  messages: ChatMessageDto[];
  onReissueCommand: (message: ChatMessageDto) => void;
  scrollAnchorRef: RefObject<HTMLDivElement>;
}

export function MessageList({
  messages,
  onReissueCommand,
  scrollAnchorRef,
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
              const timestamp = formatTime(message.createdAt);
              const Icon = roleStyle.icon;
              const alignmentClass =
                roleStyle.align === 'end' ? 'ml-auto w-full max-w-2xl' : 'mr-auto w-full max-w-2xl';
              const containerClassName = cn(MESSAGE_CONTAINER_CLASS, roleStyle.cardClassName);
              const showReissueButton = message.role !== 'assistant';

              return (
                <Box key={message.id} className={alignmentClass}>
                  <Box className={containerClassName}>
                    <Flex align="start" justify="between" gap="3">
                      <Flex align="center" gap="2">
                        <Box className="rounded-full bg-white/15 p-2 shadow-inner">
                          <Icon className={`h-4 w-4 ${roleStyle.iconClassName}`} />
                        </Box>
                        <Badge color={roleStyle.badgeColor} variant="soft">
                          {roleStyle.label}
                        </Badge>
                        {timestamp ? (
                          <Text size="1" color="gray">
                            {timestamp}
                          </Text>
                        ) : null}
                      </Flex>
                      {showReissueButton ? (
                        <Tooltip content="Re-issue command">
                          <IconButton
                            size="1"
                            variant="solid"
                            onClick={() => onReissueCommand(message)}
                            aria-label="Re-issue command"
                          >
                            <ReloadIcon className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </Flex>
                    <ChatMessageContent
                      messageRole={message.role}
                      content={message.content}
                      className={cn('text-base text-white', roleStyle.contentClassName)}
                    />
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
