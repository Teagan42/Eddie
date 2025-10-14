import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { CreateChatSessionDto } from "./dto/create-chat-session.dto";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { ChatMessageDto, ChatSessionDto } from "./dto/chat-session.dto";
import {
  CHAT_SESSIONS_REPOSITORY,
  type AgentInvocationSnapshot,
  type ChatMessageRecord,
  type ChatSessionRecord,
  type ChatSessionsRepository,
} from "./chat-sessions.repository";
import { ChatMessageCreatedEvent } from "@eddie/types";

export type { AgentInvocationSnapshot } from "./chat-sessions.repository";

export type AgentActivityState = "idle" | "thinking" | "tool" | "error";

export interface AgentActivityEvent {
  sessionId: string;
  state: AgentActivityState;
  timestamp: string;
}

export interface ChatSessionsListener {
  onSessionCreated(session: ChatSessionDto): void;
  onSessionUpdated(session: ChatSessionDto): void;
  onMessageCreated(message: ChatMessageDto): void;
  onMessageUpdated(message: ChatMessageDto): void;
  onAgentActivity?(event: AgentActivityEvent): void;
}

@Injectable()
export class ChatSessionsService {
  private readonly listeners = new Set<ChatSessionsListener>();

  constructor(
    @Inject(CHAT_SESSIONS_REPOSITORY)
    private readonly repository: ChatSessionsRepository,
    @Optional() private readonly eventBus?: EventBus
  ) {}

  registerListener(listener: ChatSessionsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private toDto(entity: ChatSessionRecord): ChatSessionDto {
    return {
      id: entity.id,
      title: entity.title,
      description: entity.description,
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private messageToDto(entity: ChatMessageRecord): ChatMessageDto {
    return {
      id: entity.id,
      sessionId: entity.sessionId,
      role: entity.role,
      content: entity.content,
      createdAt: entity.createdAt.toISOString(),
      ...(entity.toolCallId ? { toolCallId: entity.toolCallId } : {}),
      ...(entity.name ? { name: entity.name } : {}),
    };
  }

  async saveAgentInvocations(
    sessionId: string,
    invocations: AgentInvocationSnapshot[]
  ): Promise<void> {
    await this.ensureSessionExists(sessionId);
    await this.repository.saveAgentInvocations(sessionId, invocations);
  }

  async listAgentInvocations(
    sessionId: string
  ): Promise<AgentInvocationSnapshot[]> {
    return this.repository.listAgentInvocations(sessionId);
  }

  private notifySessionCreated(session: ChatSessionDto): void {
    for (const listener of this.listeners) {
      listener.onSessionCreated(session);
    }
  }

  private notifySessionUpdated(session: ChatSessionDto): void {
    for (const listener of this.listeners) {
      listener.onSessionUpdated(session);
    }
  }

  private notifyMessageCreated(message: ChatMessageDto): void {
    for (const listener of this.listeners) {
      listener.onMessageCreated(message);
    }
  }

  private notifyMessageUpdated(message: ChatMessageDto): void {
    for (const listener of this.listeners) {
      if (typeof listener.onMessageUpdated === "function") {
        listener.onMessageUpdated(message);
      }
    }
  }

  private notifyAgentActivity(event: AgentActivityEvent): void {
    for (const listener of this.listeners) {
      if (typeof listener.onAgentActivity === "function") {
        listener.onAgentActivity(event);
      }
    }
  }

  async listSessions(): Promise<ChatSessionDto[]> {
    const sessions = await this.repository.listSessions();
    return sessions.map((session) => this.toDto(session));
  }

  async getSession(id: string): Promise<ChatSessionDto> {
    const session = await this.ensureSessionExists(id);
    return this.toDto(session);
  }

  async createSession(dto: CreateChatSessionDto): Promise<ChatSessionDto> {
    const entity = await this.repository.createSession({
      title: dto.title,
      description: dto.description,
    });
    const sessionDto = this.toDto(entity);
    this.notifySessionCreated(sessionDto);
    return sessionDto;
  }

  async archiveSession(id: string): Promise<ChatSessionDto> {
    const session = await this.repository.updateSessionStatus(id, "archived");
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    const dto = this.toDto(session);
    this.notifySessionUpdated(dto);
    return dto;
  }

  async listMessages(sessionId: string): Promise<ChatMessageDto[]> {
    await this.ensureSessionExists(sessionId);
    const messages = await this.repository.listMessages(sessionId);
    return messages.map((message) => this.messageToDto(message));
  }

  async addMessage(
    sessionId: string,
    dto: CreateChatMessageDto
  ): Promise<{ message: ChatMessageDto; session: ChatSessionDto }> {
    const result = await this.repository.appendMessage({
      sessionId,
      role: dto.role,
      content: dto.content,
      toolCallId: dto.toolCallId,
      name: dto.name,
    });
    if (!result) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
    }
    const messageDto = this.messageToDto(result.message);
    const sessionDto = this.toDto(result.session);
    this.notifyMessageCreated(messageDto);
    this.notifySessionUpdated(sessionDto);
    this.eventBus?.publish(
      new ChatMessageCreatedEvent(messageDto.sessionId, messageDto.id)
    );
    return { message: messageDto, session: sessionDto };
  }

  async updateMessageContent(
    sessionId: string,
    messageId: string,
    content: string
  ): Promise<ChatMessageDto> {
    await this.ensureSessionExists(sessionId);
    const entity = await this.repository.updateMessageContent(
      sessionId,
      messageId,
      content
    );
    if (!entity) {
      throw new NotFoundException(
        `Message ${messageId} not found in session ${sessionId}`
      );
    }
    const dto = this.messageToDto(entity);
    this.notifyMessageUpdated(dto);
    return dto;
  }

  async setAgentActivity(
    sessionId: string,
    state: AgentActivityState
  ): Promise<void> {
    await this.ensureSessionExists(sessionId);
    this.notifyAgentActivity({
      sessionId,
      state,
      timestamp: new Date().toISOString(),
    });
  }

  private async ensureSessionExists(id: string): Promise<ChatSessionRecord> {
    const session = await this.repository.getSessionById(id);
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    return session;
  }
}
