import type { ChatMessageDto } from "../dto/chat-session.dto";

export class ChatMessagePartialEvent {
  constructor(public readonly message: ChatMessageDto) {}
}
