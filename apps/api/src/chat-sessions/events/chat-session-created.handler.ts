import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { ChatSessionCreatedEvent } from "@eddie/types";
import { ChatSessionsService } from "../chat-sessions.service";
import { ChatSessionsGateway } from "../chat-sessions.gateway";

@EventsHandler(ChatSessionCreatedEvent)
export class ChatSessionCreatedEventHandler implements IEventHandler<ChatSessionCreatedEvent> {
  constructor(
    private readonly service: ChatSessionsService,
    private readonly gateway: ChatSessionsGateway,
  ) {}

  handle(event: ChatSessionCreatedEvent): void {
    const session = this.service.getSession(event.sessionId);
    this.gateway.emitSessionCreated(session);
  }
}
