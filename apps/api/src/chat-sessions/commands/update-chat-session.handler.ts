import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ChatSessionsService } from "../chat-sessions.service";
import { UpdateChatSessionCommand } from "./update-chat-session.command";

type RenameSessionResult = Awaited<
  ReturnType<ChatSessionsService["renameSession"]>
>;

@CommandHandler(UpdateChatSessionCommand)
export class UpdateChatSessionHandler implements ICommandHandler<
  UpdateChatSessionCommand,
  RenameSessionResult
> {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  async execute({ sessionId, dto }: UpdateChatSessionCommand): Promise<RenameSessionResult> {
    return this.chatSessionsService.renameSession(sessionId, dto);
  }
}
