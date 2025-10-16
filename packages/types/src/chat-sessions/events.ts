import { IEvent } from "@nestjs/cqrs";
import { StreamEvent } from "../providers";

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

export class ChatMessagePartialEvent {
  constructor(public readonly message: unknown) {}
}

export class ChatSessionToolCallEvent {
  private readonly payload: unknown;
  constructor(
    public readonly sessionId: string,
    public readonly id: string | undefined,
    public readonly name: string | undefined,
    args: unknown,
    public readonly timestamp: string | undefined,
    public readonly agentId: string | null | undefined,
  ) {
    this.payload = args;
  }

  get arguments(): unknown {
    return this.payload;
  }
}

export class ChatSessionToolResultEvent {
  constructor(
    public readonly sessionId: string,
    public readonly id: string | undefined,
    public readonly name: string | undefined,
    public readonly result: unknown,
    public readonly timestamp: string | undefined,
    public readonly agentId: string | null | undefined,
  ) {}
}

export const CHAT_SESSION_EVENT_CLASSES = [
  ChatSessionCreatedEvent,
  ChatSessionUpdatedEvent,
  ChatMessageCreatedEvent,
  ChatMessagePartialEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
] as const;

export class AgentStreamEvent implements IEvent {
  constructor(public readonly event: StreamEvent) {}
}