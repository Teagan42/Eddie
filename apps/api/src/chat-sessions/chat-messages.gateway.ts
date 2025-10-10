import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server } from "ws";
import { emitEvent } from "../websocket/utils";
import { ChatMessageDto } from "./dto/chat-session.dto";

@WebSocketGateway({ path: "/chat-messages" })
export class ChatMessagesGateway {
  @WebSocketServer()
  private server!: Server;

  emitPartial(message: ChatMessageDto): void {
    emitEvent(this.server, "message.partial", message);
  }
}
