import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "ws";
import { emitEvent } from "../websocket/utils";
import { ChatMessageDto } from "./dto/chat-session.dto";
import {
  ChatMessageReasoningCompleteEvent,
  ChatMessageReasoningPartialEvent,
} from "@eddie/types";

@WebSocketGateway({ path: "/chat-messages" })
export class ChatMessagesGateway {
  @WebSocketServer()
  private server!: Server;

  emitPartial(message: ChatMessageDto): void {
    emitEvent(this.server, "message.partial", message);
  }

  emitReasoningPartial(event: ChatMessageReasoningPartialEvent): void {
    emitEvent(this.server, "message.reasoning.partial", event);
  }

  emitReasoningComplete(event: ChatMessageReasoningCompleteEvent): void {
    emitEvent(this.server, "message.reasoning.completed", event);
  }
}
