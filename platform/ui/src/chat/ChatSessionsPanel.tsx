import { Flex, Grid, IconButton, TextField } from "@radix-ui/themes";
import { PlusIcon } from "@radix-ui/react-icons";
import type { FormEvent, JSX } from "react";

import { Panel } from "../common";
import { SessionsList } from "../overview";
import { MessageComposer } from "./MessageComposer";
import { SessionDetail } from "./SessionDetail";
import type { ChatMessage, ChatSession } from "./types";

export interface ChatSessionsPanelProps {
  sessions: ChatSession[] | undefined;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (event: FormEvent<HTMLFormElement>) => void;
  newSessionTitle: string;
  onNewSessionTitleChange: (value: string) => void;
  isCreatingSession: boolean;
  activeSession: ChatSession | null;
  messages: ChatMessage[] | undefined;
  isMessagesLoading: boolean;
  onSubmitMessage: () => void;
  messageDraft: string;
  onMessageDraftChange: (value: string) => void;
  isMessagePending: boolean;
}

export function ChatSessionsPanel({
  sessions,
  selectedSessionId,
  onSelectSession,
  onCreateSession,
  newSessionTitle,
  onNewSessionTitleChange,
  isCreatingSession,
  activeSession,
  messages,
  isMessagesLoading,
  onSubmitMessage,
  messageDraft,
  onMessageDraftChange,
  isMessagePending,
}: ChatSessionsPanelProps): JSX.Element {
  const isComposerDisabled = !selectedSessionId || isMessagePending;

  const sessionCreationForm = (
    <form onSubmit={onCreateSession} className="flex items-center gap-2">
      <TextField.Root
        size="2"
        placeholder="Session title"
        value={newSessionTitle}
        onChange={(event) => onNewSessionTitleChange(event.target.value)}
        required
      />
      <IconButton type="submit" variant="solid" color="jade" disabled={isCreatingSession}>
        <PlusIcon />
      </IconButton>
    </form>
  );

  return (
    <Panel
      title="Chat Sessions"
      description="Inspect and collaborate on control plane sessions"
      actions={sessionCreationForm}
    >
      <Grid columns={{ initial: "1", md: "2" }} gap="5">
        <SessionsList
          sessions={sessions}
          selectedSessionId={selectedSessionId}
          onSelectSession={onSelectSession}
        />

        <Flex direction="column" gap="4">
          <SessionDetail
            session={activeSession}
            isLoading={isMessagesLoading}
            messages={messages}
          />

          <MessageComposer
            disabled={isComposerDisabled}
            value={messageDraft}
            onChange={onMessageDraftChange}
            onSubmit={onSubmitMessage}
          />
        </Flex>
      </Grid>
    </Panel>
  );
}
