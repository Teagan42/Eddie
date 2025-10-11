export class ChatSessionCreatedEvent {
  constructor(public readonly sessionId: string) {}
}

export class ChatSessionUpdatedEvent {
  constructor(
    public readonly sessionId: string,
    public readonly changedFields: ReadonlyArray<string>,
  ) {}
}

export class ChatMessageCreatedEvent {
  constructor(
    public readonly sessionId: string,
    public readonly messageId: string,
  ) {}
}

export class ChatMessageUpdatedEvent {
  constructor(
    public readonly sessionId: string,
    public readonly messageId: string,
  ) {}
}

export class AgentActivityChangedEvent {
  constructor(
    public readonly sessionId: string,
    public readonly state: string,
    public readonly timestamp: string,
  ) {}
}

export const CHAT_SESSION_EVENT_CLASSES = [
  ChatSessionCreatedEvent,
  ChatSessionUpdatedEvent,
  ChatMessageCreatedEvent,
  ChatMessageUpdatedEvent,
  AgentActivityChangedEvent,
] as const;
