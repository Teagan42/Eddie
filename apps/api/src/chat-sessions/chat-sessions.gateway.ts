import { UsePipes, ValidationPipe } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import * as websocketUtils from "../websocket/utils";
import type { AgentActivityState } from "./chat-session.types";
import { ChatMessageDto, ChatSessionDto } from "./dto/chat-session.dto";
import { SendChatMessagePayloadDto } from "./dto/send-chat-message.dto";
import { SendChatMessageCommand } from "./commands/send-chat-message.command";
import type { ExecutionTreeState } from "@eddie/types";

@WebSocketGateway({
  path: "/chat-sessions",
})
export class ChatSessionsGateway {
  @WebSocketServer()
  private server!: Server;

  constructor(private readonly commandBus: CommandBus) {}

  emitSessionCreated(session: ChatSessionDto): void {
    websocketUtils.emitEvent(this.server, "session.created", session);
  }

  emitSessionUpdated(session: ChatSessionDto): void {
    websocketUtils.emitEvent(this.server, "session.updated", session);
  }

  emitSessionDeleted(id: string): void {
    websocketUtils.emitEvent(this.server, "session.deleted", { id });
  }

  emitMessageCreated(message: ChatMessageDto): void {
    websocketUtils.emitEvent(this.server, "message.created", message);
  }

  emitMessageUpdated(message: ChatMessageDto): void {
    websocketUtils.emitEvent(this.server, "message.updated", message);
  }

  emitAgentActivity(event: {
    sessionId: string;
    state: AgentActivityState;
    timestamp: string;
  }): void {
    websocketUtils.emitEvent(this.server, "agent.activity", event);
  }

  emitExecutionTreeUpdated(event: {
    sessionId: string;
    state: ExecutionTreeState;
  }): void {
    websocketUtils.emitEvent(this.server, "execution-tree.updated", event);
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
    await this.commandBus.execute(new SendChatMessageCommand(sessionId, message));
  }
}
