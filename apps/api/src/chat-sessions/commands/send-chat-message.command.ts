import type { CreateChatMessageDto } from "../dto/create-chat-message.dto";

export class SendChatMessageCommand {
  constructor(
    public readonly sessionId: string,
    public readonly dto: CreateChatMessageDto,
  ) {}
}
