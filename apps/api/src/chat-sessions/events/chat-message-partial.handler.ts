import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { ChatMessagesGateway } from "../chat-messages.gateway";
import { ChatMessagePartialEvent } from "./chat-message-partial.event";

@EventsHandler(ChatMessagePartialEvent)
export class ChatMessagePartialEventHandler implements IEventHandler<ChatMessagePartialEvent> {
  constructor(private readonly gateway: ChatMessagesGateway) {}

  handle(event: ChatMessagePartialEvent): void {
    this.gateway.emitPartial(event.message);
  }
}
