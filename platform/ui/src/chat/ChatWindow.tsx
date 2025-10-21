import type { RefObject } from "react";
import { Flex, SegmentedControl } from "@radix-ui/themes";

import {
  AgentActivityIndicator,
  type AgentActivityState,
} from "./AgentActivityIndicator";
import {
  MessageList,
  type MessageListItem,
} from "./MessageList";
import { MessageComposer } from "./MessageComposer";

const COMPOSER_ROLES = ["user", "system"] as const;
const COMPOSER_ROLE_LABELS: Record<(typeof COMPOSER_ROLES)[number], string> = {
  user: "Ask",
  system: "Run",
};

export type ChatWindowComposerRole = (typeof COMPOSER_ROLES)[number];

export interface ChatWindowProps {
  messages: MessageListItem[];
  onReissueCommand: (message: MessageListItem) => void;
  scrollAnchorRef: RefObject<HTMLDivElement>;
  agentActivityState: AgentActivityState;
  composerRole: ChatWindowComposerRole;
  onComposerRoleChange: (role: ChatWindowComposerRole) => void;
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
          onValueChange={(value) =>
            onComposerRoleChange(value as ChatWindowComposerRole)
          }
          disabled={composerRoleDisabled}
        >
          {COMPOSER_ROLES.map((role) => (
            <SegmentedControl.Item key={role} value={role}>
              {COMPOSER_ROLE_LABELS[role]}
            </SegmentedControl.Item>
          ))}
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
