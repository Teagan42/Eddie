import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ChatSessionsService } from "../chat-sessions.service";
import { SendChatMessageCommand } from "./send-chat-message.command";

type AddMessageResult = Awaited<
  ReturnType<ChatSessionsService["addMessage"]>
>;

@CommandHandler(SendChatMessageCommand)
export class SendChatMessageHandler implements ICommandHandler<
  SendChatMessageCommand,
  AddMessageResult
> {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  async execute({ sessionId, dto }: SendChatMessageCommand): Promise<AddMessageResult> {
    return this.chatSessionsService.addMessage(sessionId, dto);
  }
}
