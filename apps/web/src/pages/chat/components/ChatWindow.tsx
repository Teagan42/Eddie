import type { RefObject } from 'react';
import { Flex, SegmentedControl } from '@radix-ui/themes';

import {
  AgentActivityIndicator,
  type AgentActivityState,
} from '../AgentActivityIndicator';
import { MessageComposer, MessageList, type MessageListItem } from '@eddie/ui/chat';

export type ComposerRole = 'user' | 'system';

export interface ChatWindowProps {
  messages: MessageListItem[];
  onReissueCommand: (message: MessageListItem) => void;
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
  onComposerSubmit: () => void;
  onInspectToolInvocation?: (toolCallId: string | null) => void;
}

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
        <SegmentedControl.Root
          value={composerRole}
          onValueChange={(value) => onComposerRoleChange(value as ComposerRole)}
          disabled={composerRoleDisabled}
        >
          <SegmentedControl.Item value="user">Ask</SegmentedControl.Item>
          <SegmentedControl.Item value="system">Run</SegmentedControl.Item>
        </SegmentedControl.Root>
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
