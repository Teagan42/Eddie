import type { ChatMessageDto, ChatSessionDto } from "../dto/chat-session.dto";
import type { AgentActivityState } from "../chat-session.types";

export class ChatSessionCreated {
  constructor(public readonly session: ChatSessionDto) {}
}

export class ChatSessionUpdated {
  constructor(public readonly session: ChatSessionDto) {}
}

export class ChatSessionDeleted {
  constructor(public readonly sessionId: string) {}
}

export type ChatMessageSentMode = "created" | "updated";

export class ChatMessageSent {
  constructor(
    public readonly sessionId: string,
    public readonly message: ChatMessageDto,
    public readonly mode: ChatMessageSentMode,
    public readonly session?: ChatSessionDto
  ) {}
}

export class AgentActivity {
  constructor(
    public readonly sessionId: string,
    public readonly state: AgentActivityState,
    public readonly timestamp: string
  ) {}
}

export type ChatSessionsDomainEvent =
  | ChatSessionCreated
  | ChatSessionUpdated
  | ChatSessionDeleted
  | ChatMessageSent
  | AgentActivity;
