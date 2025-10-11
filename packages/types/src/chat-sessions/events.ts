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

export const CHAT_SESSION_EVENT_CLASSES = [
  ChatSessionCreatedEvent,
  ChatSessionUpdatedEvent,
  ChatMessageCreatedEvent,
] as const;
