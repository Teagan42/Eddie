import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { ChatSessionDto } from "../dto/chat-session.dto";
import { ChatSessionsService } from "../chat-sessions.service";
import { CreateChatSessionCommand } from "./create-chat-session.command";

@CommandHandler(CreateChatSessionCommand)
export class CreateChatSessionHandler implements ICommandHandler<
  CreateChatSessionCommand,
  ChatSessionDto
> {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  async execute({ dto }: CreateChatSessionCommand): Promise<ChatSessionDto> {
    return this.chatSessionsService.createSession(dto);
  }
}
