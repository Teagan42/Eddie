import {
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { ChatSessionsService, ChatSessionsListener } from "./chat-sessions.service";
import { ChatMessageDto, ChatSessionDto } from "./dto/chat-session.dto";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";

@WebSocketGateway({ namespace: "/chat-sessions" })
export class ChatSessionsGateway
  implements ChatSessionsListener, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private unregister: (() => void) | null = null;

  constructor(private readonly service: ChatSessionsService) {}

  onModuleInit(): void {
    if (!this.service || typeof this.service.registerListener !== "function") {
      return;
    }
    this.unregister = this.service.registerListener(this);
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.unregister = null;
  }

  onSessionCreated(session: ChatSessionDto): void {
    this.server.emit("session.created", session);
  }

  onSessionUpdated(session: ChatSessionDto): void {
    this.server.emit("session.updated", session);
  }

  onMessageCreated(message: ChatMessageDto): void {
    this.server.emit("message.created", message);
  }

  @SubscribeMessage("message.send")
  handleSendMessage(
    @MessageBody() payload: { sessionId: string; message: CreateChatMessageDto }
  ): void {
    const { sessionId, message } = payload;
    this.service.addMessage(sessionId, message);
  }
}
