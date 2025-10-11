import type { ChatSessionToolEventPayloadBase } from "./chat-session-tool-event-payload";

export interface ChatSessionToolCallPayload extends ChatSessionToolEventPayloadBase {
  arguments?: unknown;
}

export class ChatSessionToolCallEvent {
  constructor(public readonly payload: ChatSessionToolCallPayload) {}
}
