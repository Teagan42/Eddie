import type { ChatSessionToolEventPayloadBase } from "./chat-session-tool-event-payload";

export interface ChatSessionToolResultPayload extends ChatSessionToolEventPayloadBase {
  result?: unknown;
}

export class ChatSessionToolResultEvent {
  constructor(public readonly payload: ChatSessionToolResultPayload) {}
}
