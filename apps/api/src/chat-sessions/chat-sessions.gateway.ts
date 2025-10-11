import {
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import { Subscription } from "rxjs";
import { emitEvent } from "../websocket/utils";
import {
  ChatSessionsService,
} from "./chat-sessions.service";
import { ChatMessageDto, ChatSessionDto } from "./dto/chat-session.dto";
import { SendChatMessagePayloadDto } from "./dto/send-chat-message.dto";
import {
  AgentActivityChangedEvent,
  ChatMessageCreatedEvent,
  ChatMessageUpdatedEvent,
  ChatSessionCreatedEvent,
  ChatSessionUpdatedEvent,
} from "@eddie/types";

@WebSocketGateway({
  path: "/chat-sessions",
})
export class ChatSessionsGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  private server!: Server;

  private readonly subscriptions: Subscription[] = [];

  constructor(
    private readonly service: ChatSessionsService,
    @Optional() private readonly events?: EventBus
  ) {}

  onModuleInit(): void {
    if (!this.events) {
      return;
    }
    this.subscriptions.push(
      this.events.ofType(ChatSessionCreatedEvent).subscribe((event) =>
        this.handleSessionCreated(event.sessionId)
      ),
      this.events.ofType(ChatSessionUpdatedEvent).subscribe((event) =>
        this.handleSessionUpdated(event.sessionId)
      ),
      this.events.ofType(ChatMessageCreatedEvent).subscribe((event) =>
        this.handleMessageCreated(event.sessionId, event.messageId)
      ),
      this.events.ofType(ChatMessageUpdatedEvent).subscribe((event) =>
        this.handleMessageUpdated(event.sessionId, event.messageId)
      ),
      this.events.ofType(AgentActivityChangedEvent).subscribe((event) =>
        this.handleAgentActivity(event.sessionId, event.state, event.timestamp)
      )
    );
  }

  onModuleDestroy(): void {
    if (!this.events) {
      return;
    }
    for (const subscription of this.subscriptions.splice(0)) {
      subscription.unsubscribe();
    }
  }

  emitSessionCreated(session: ChatSessionDto): void {
    emitEvent(this.server, "session.created", session);
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

  private handleSessionCreated(sessionId: string): void {
    try {
      const session = this.service.getSession(sessionId);
      this.emitSessionCreated(session);
    } catch {
      // session removed; ignore
    }
  }

  private handleSessionUpdated(sessionId: string): void {
    this.emitSession("session.updated", sessionId);
  }

  private handleMessageCreated(sessionId: string, messageId: string): void {
    this.emitMessage("message.created", sessionId, messageId);
  }

  private handleMessageUpdated(sessionId: string, messageId: string): void {
    this.emitMessage("message.updated", sessionId, messageId);
  }

  private handleAgentActivity(
    sessionId: string,
    state: string,
    timestamp: string
  ): void {
    emitEvent(this.server, "agent.activity", { sessionId, state, timestamp });
  }

  private emitSession(event: string, sessionId: string): void {
    try {
      const session = this.service.getSession(sessionId);
      emitEvent(this.server, event, session);
    } catch {
      // session removed; ignore
    }
  }

  private emitMessage(
    event: string,
    sessionId: string,
    messageId: string
  ): void {
    try {
      const messages = this.service.listMessages(sessionId);
      const message = messages.find((entry) => entry.id === messageId);
      if (message) {
        emitEvent(this.server, event, message as ChatMessageDto);
      }
    } catch {
      // session removed; ignore
    }
  }
}
