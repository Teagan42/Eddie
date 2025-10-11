import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { ToolsGateway } from "../../tools/tools.gateway";
import { ChatSessionToolResultEvent } from "./chat-session-tool-result.event";

@EventsHandler(ChatSessionToolResultEvent)
export class ChatSessionToolResultEventHandler implements IEventHandler<ChatSessionToolResultEvent> {
  constructor(private readonly gateway: ToolsGateway) {}

  handle(event: ChatSessionToolResultEvent): void {
    this.gateway.emitToolResult(event.payload);
  }
}
