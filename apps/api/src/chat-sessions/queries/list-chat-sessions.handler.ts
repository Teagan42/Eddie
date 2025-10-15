import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { ChatSessionsService } from "../chat-sessions.service";
import { ListChatSessionsQuery } from "./list-chat-sessions.query";

type ListChatSessionsResult = Awaited<
  ReturnType<ChatSessionsService["listSessions"]>
>;

@QueryHandler(ListChatSessionsQuery)
export class ListChatSessionsHandler implements IQueryHandler<
  ListChatSessionsQuery,
  ListChatSessionsResult
> {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  async execute(): Promise<ListChatSessionsResult> {
    return this.chatSessionsService.listSessions();
  }
}
