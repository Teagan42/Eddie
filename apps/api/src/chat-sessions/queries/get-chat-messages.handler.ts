import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { ChatSessionsService } from "../chat-sessions.service";
import { GetChatMessagesQuery } from "./get-chat-messages.query";

type GetChatMessagesResult = Awaited<
  ReturnType<ChatSessionsService["listMessages"]>
>;

@QueryHandler(GetChatMessagesQuery)
export class GetChatMessagesHandler implements IQueryHandler<
  GetChatMessagesQuery,
  GetChatMessagesResult
> {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  async execute({ sessionId }: GetChatMessagesQuery): Promise<GetChatMessagesResult> {
    return this.chatSessionsService.listMessages(sessionId);
  }
}
