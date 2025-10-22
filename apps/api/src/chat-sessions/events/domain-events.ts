import type { IEvent } from "@nestjs/cqrs";
import type { ChatMessageDto, ChatSessionDto } from "../dto/chat-session.dto";
import type { AgentActivityState } from "@eddie/types";

export class ChatSessionCreated implements IEvent {
  constructor(public readonly session: ChatSessionDto) { }
}

export class ChatSessionUpdated implements IEvent {
  constructor(public readonly session: ChatSessionDto) { }
}

export class ChatSessionDeleted implements IEvent {
  constructor(public readonly sessionId: string) { }
}

export type ChatMessageSentMode = "created" | "updated";

export class ChatMessageSent implements IEvent {
  constructor(
    public readonly sessionId: string,
    public readonly message: ChatMessageDto,
    public readonly mode: ChatMessageSentMode,
    public readonly session?: ChatSessionDto
  ) { }
}

export class AgentActivity implements IEvent {
  constructor(
    public readonly sessionId: string,
    public readonly state: AgentActivityState,
    public readonly timestamp: string
  ) { }
}

export type ChatSessionsDomainEvent =
  | ChatSessionCreated
  | ChatSessionUpdated
  | ChatSessionDeleted
  | ChatMessageSent
  | AgentActivity;
