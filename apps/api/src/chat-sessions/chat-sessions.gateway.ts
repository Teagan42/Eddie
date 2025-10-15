import { UsePipes, ValidationPipe } from "@nestjs/common";
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import { emitEvent } from "../websocket/utils";
import { ChatSessionsService } from "./chat-sessions.service";
import type { AgentActivityState } from "./chat-session.types";
import { ChatMessageDto, ChatSessionDto } from "./dto/chat-session.dto";
import { SendChatMessagePayloadDto } from "./dto/send-chat-message.dto";

@WebSocketGateway({
  path: "/chat-sessions",
})
export class ChatSessionsGateway {
  @WebSocketServer()
  private server!: Server;

  constructor(private readonly service: ChatSessionsService) {}

  emitSessionCreated(session: ChatSessionDto): void {
    emitEvent(this.server, "session.created", session);
  }

  emitSessionUpdated(session: ChatSessionDto): void {
    emitEvent(this.server, "session.updated", session);
  }

  emitSessionDeleted(id: string): void {
    emitEvent(this.server, "session.deleted", { id });
  }

  emitMessageCreated(message: ChatMessageDto): void {
    emitEvent(this.server, "message.created", message);
  }

  emitMessageUpdated(message: ChatMessageDto): void {
    emitEvent(this.server, "message.updated", message);
  }

  emitAgentActivity(event: {
    sessionId: string;
    state: AgentActivityState;
    timestamp: string;
  }): void {
    emitEvent(this.server, "agent.activity", event);
  }

  @SubscribeMessage("message.send")
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  )
  async handleSendMessage(
    @MessageBody() payload: SendChatMessagePayloadDto
  ): Promise<void> {
    const { sessionId, message } = payload;
    await this.service.addMessage(sessionId, message);
  }
}
