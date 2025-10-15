import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ChatSessionsService } from "../chat-sessions.service";
import { DeleteChatSessionCommand } from "./delete-chat-session.command";

@CommandHandler(DeleteChatSessionCommand)
export class DeleteChatSessionHandler implements ICommandHandler<
  DeleteChatSessionCommand,
  void
> {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  async execute({ sessionId }: DeleteChatSessionCommand): Promise<void> {
    await this.chatSessionsService.deleteSession(sessionId);
  }
}
