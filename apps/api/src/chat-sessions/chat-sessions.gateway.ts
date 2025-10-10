import {
  OnModuleDestroy,
  OnModuleInit,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import { emitEvent } from "../websocket/utils";
import { ChatSessionsService, ChatSessionsListener } from "./chat-sessions.service";
import { ChatMessageDto, ChatSessionDto } from "./dto/chat-session.dto";
import { SendChatMessagePayloadDto } from "./dto/send-chat-message.dto";

@WebSocketGateway({
  path: "/chat-sessions",
})
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
    emitEvent(this.server, "session.created", session);
  }

  onSessionUpdated(session: ChatSessionDto): void {
    emitEvent(this.server, "session.updated", session);
  }

  onMessageCreated(message: ChatMessageDto): void {
    emitEvent(this.server, "message.created", message);
  }

  @SubscribeMessage("message.send")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  )
  handleSendMessage(@MessageBody() payload: SendChatMessagePayloadDto): void {
    const { sessionId, message } = payload;
    this.service.addMessage(sessionId, message);
  }
}
