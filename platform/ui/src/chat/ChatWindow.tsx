import type { FormEventHandler, RefObject } from 'react';
import { Flex, Select } from '@radix-ui/themes';

import type { ChatMessageDto } from '@eddie/api-client';

import {
  AgentActivityIndicator,
  type AgentActivityState,
} from './AgentActivityIndicator';
import { MessageComposer } from '../common';
import { MessageList, type MessageListItem } from './MessageList';

export type ComposerRole = 'user' | 'system' | 'developer';

export interface ChatWindowProps {
  messages: MessageListItem[];
  onReissueCommand: (message: ChatMessageDto) => void;
  scrollAnchorRef: RefObject<HTMLDivElement>;
  agentActivityState: AgentActivityState;
  composerRole: ComposerRole;
  onComposerRoleChange: (role: ComposerRole) => void;
  composerRoleDisabled?: boolean;
  composerValue: string;
  onComposerValueChange: (value: string) => void;
  composerDisabled?: boolean;
  composerSubmitDisabled?: boolean;
  composerPlaceholder?: string;
  onComposerSubmit: FormEventHandler<HTMLFormElement>;
  onInspectToolInvocation?: (toolCallId: string | null) => void;
}

const COMPOSER_ROLE_OPTIONS: Array<{ value: ComposerRole; label: string }> = [
  { value: 'user', label: 'User' },
  { value: 'system', label: 'System' },
  { value: 'developer', label: 'Developer' },
];

export function ChatWindow({
  messages,
  onReissueCommand,
  scrollAnchorRef,
  agentActivityState,
  composerRole,
  onComposerRoleChange,
  composerRoleDisabled = false,
  composerValue,
  onComposerValueChange,
  composerDisabled = false,
  composerSubmitDisabled = false,
  composerPlaceholder,
  onComposerSubmit,
  onInspectToolInvocation,
}: ChatWindowProps): JSX.Element {
  return (
    <Flex direction="column" gap="6">
      <MessageList
        messages={messages}
        onReissueCommand={onReissueCommand}
        scrollAnchorRef={scrollAnchorRef}
        onInspectToolInvocation={onInspectToolInvocation}
      />
      <Flex direction="column" gap="3">
        <AgentActivityIndicator state={agentActivityState} />
        <Select.Root
          value={composerRole}
          onValueChange={(value) => onComposerRoleChange(value as ComposerRole)}
          disabled={composerRoleDisabled}
        >
          <Select.Trigger aria-label="Message role" />
          <Select.Content>
            {COMPOSER_ROLE_OPTIONS.map((option) => (
              <Select.Item key={option.value} value={option.value}>
                {option.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <MessageComposer
          disabled={composerDisabled}
          value={composerValue}
          onChange={onComposerValueChange}
          onSubmit={onComposerSubmit}
          placeholder={composerPlaceholder}
          submitDisabled={composerSubmitDisabled}
        />
      </Flex>
    </Flex>
  );
}
