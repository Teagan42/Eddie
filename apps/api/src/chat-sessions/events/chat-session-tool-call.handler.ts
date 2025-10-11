import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { ToolsGateway } from "../../tools/tools.gateway";
import { ChatSessionToolCallEvent } from "./chat-session-tool-call.event";

@EventsHandler(ChatSessionToolCallEvent)
export class ChatSessionToolCallEventHandler implements IEventHandler<ChatSessionToolCallEvent> {
  constructor(private readonly gateway: ToolsGateway) {}

  handle(event: ChatSessionToolCallEvent): void {
    this.gateway.emitToolCall(event.payload);
  }
}
