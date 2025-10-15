import type { CreateChatSessionDto } from "../dto/create-chat-session.dto";

export class CreateChatSessionCommand {
  constructor(public readonly dto: CreateChatSessionDto) {}
}
