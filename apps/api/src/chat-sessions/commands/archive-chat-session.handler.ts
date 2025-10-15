import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ChatSessionsService } from "../chat-sessions.service";
import { ArchiveChatSessionCommand } from "./archive-chat-session.command";

type ArchiveChatSessionResult = Awaited<
  ReturnType<ChatSessionsService["archiveSession"]>
>;

@CommandHandler(ArchiveChatSessionCommand)
export class ArchiveChatSessionHandler implements ICommandHandler<
  ArchiveChatSessionCommand,
  ArchiveChatSessionResult
> {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  async execute({ sessionId }: ArchiveChatSessionCommand): Promise<ArchiveChatSessionResult> {
    return this.chatSessionsService.archiveSession(sessionId);
  }
}
