import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { CreateChatSessionDto } from "./dto/create-chat-session.dto";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { ChatMessageDto, ChatSessionDto } from "./dto/chat-session.dto";
import {
  AgentActivityChangedEvent,
  ChatMessageCreatedEvent,
  ChatMessageUpdatedEvent,
  ChatSessionCreatedEvent,
  ChatSessionUpdatedEvent,
} from "@eddie/types";
import {
  CHAT_SESSIONS_REPOSITORY,
  type AgentInvocationSnapshot,
  type ChatMessageRecord,
  type ChatSessionRecord,
  type ChatSessionsRepository,
} from "./chat-sessions.repository";

export type { AgentInvocationSnapshot } from "./chat-sessions.repository";

export type AgentActivityState = "idle" | "thinking" | "tool" | "error";

@Injectable()
export class ChatSessionsService {
  constructor(
    @Inject(CHAT_SESSIONS_REPOSITORY)
    private readonly repository: ChatSessionsRepository,
    @Optional() private readonly eventBus?: EventBus
  ) {}

  private publish(event: object): void {
    this.eventBus?.publish(event);
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

  saveAgentInvocations(
    sessionId: string,
    invocations: AgentInvocationSnapshot[]
  ): void {
    this.ensureSessionExists(sessionId);
    this.repository.saveAgentInvocations(sessionId, invocations);
  }

  listAgentInvocations(sessionId: string): AgentInvocationSnapshot[] {
    return this.repository.listAgentInvocations(sessionId);
  }

  listSessions(): ChatSessionDto[] {
    return this.repository
      .listSessions()
      .map((session) => this.toDto(session));
  }

  getSession(id: string): ChatSessionDto {
    const session = this.repository.getSessionById(id);
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    return this.toDto(session);
  }

  createSession(dto: CreateChatSessionDto): ChatSessionDto {
    const entity = this.repository.createSession({
      title: dto.title,
      description: dto.description,
    });
    const sessionDto = this.toDto(entity);
    this.publish(new ChatSessionCreatedEvent(sessionDto.id));
    return sessionDto;
  }

  archiveSession(id: string): ChatSessionDto {
    const session = this.repository.updateSessionStatus(id, "archived");
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    const dto = this.toDto(session);
    this.publish(new ChatSessionUpdatedEvent(dto.id, ["status"]));
    return dto;
  }

  listMessages(sessionId: string): ChatMessageDto[] {
    this.ensureSessionExists(sessionId);
    return this.repository
      .listMessages(sessionId)
      .map((message) => this.messageToDto(message));
  }

  addMessage(
    sessionId: string,
    dto: CreateChatMessageDto
  ): { message: ChatMessageDto; session: ChatSessionDto } {
    const result = this.repository.appendMessage({
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
    this.publish(new ChatMessageCreatedEvent(messageDto.sessionId, messageDto.id));
    this.publish(new ChatSessionUpdatedEvent(sessionDto.id, ["updatedAt"]));
    return { message: messageDto, session: sessionDto };
  }

  updateMessageContent(sessionId: string, messageId: string, content: string): ChatMessageDto {
    this.ensureSessionExists(sessionId);
    const entity = this.repository.updateMessageContent(
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
    this.publish(new ChatMessageUpdatedEvent(sessionId, messageId));
    return dto;
  }

  setAgentActivity(sessionId: string, state: AgentActivityState): void {
    this.ensureSessionExists(sessionId);
    this.publish(
      new AgentActivityChangedEvent(
        sessionId,
        state,
        new Date().toISOString()
      )
    );
  }

  private ensureSessionExists(id: string): void {
    if (!this.repository.getSessionById(id)) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
  }
}
