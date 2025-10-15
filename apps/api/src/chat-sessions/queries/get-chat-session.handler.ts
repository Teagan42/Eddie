import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import { ChatSessionsService } from "../chat-sessions.service";
import { GetChatSessionQuery } from "./get-chat-session.query";

type GetChatSessionResult = Awaited<
  ReturnType<ChatSessionsService["getSession"]>
>;

@QueryHandler(GetChatSessionQuery)
export class GetChatSessionHandler implements IQueryHandler<
  GetChatSessionQuery,
  GetChatSessionResult
> {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  async execute({ sessionId }: GetChatSessionQuery): Promise<GetChatSessionResult> {
    return this.chatSessionsService.getSession(sessionId);
  }
}
