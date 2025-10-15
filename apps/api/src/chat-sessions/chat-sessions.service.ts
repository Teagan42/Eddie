import { Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { CreateChatSessionDto } from "./dto/create-chat-session.dto";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { ChatMessageDto, ChatSessionDto } from "./dto/chat-session.dto";
import { UpdateChatSessionDto } from "./dto/update-chat-session.dto";
import {
  CHAT_SESSIONS_REPOSITORY,
  type AgentInvocationSnapshot,
  type ChatMessageRecord,
  type ChatSessionRecord,
  type ChatSessionsRepository,
  type UpdateChatSessionMetadataInput,
} from "./chat-sessions.repository";
import { ChatMessageCreatedEvent } from "@eddie/types";
import {
  AgentActivity,
  ChatMessageSent,
  ChatSessionCreated,
  ChatSessionDeleted,
  ChatSessionUpdated,
} from "./events";
import type { AgentActivityState } from "./chat-session.types";

export type { AgentInvocationSnapshot } from "./chat-sessions.repository";

@Injectable()
export class ChatSessionsService {
  constructor(
    @Inject(CHAT_SESSIONS_REPOSITORY)
    private readonly repository: ChatSessionsRepository,
    @Optional() private readonly eventBus?: EventBus
  ) {}

  private publish(event: unknown): void {
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

  private buildUpdatePatch(
    dto: UpdateChatSessionDto
  ): UpdateChatSessionMetadataInput {
    const patch: UpdateChatSessionMetadataInput = {};
    if (Object.prototype.hasOwnProperty.call(dto, "title")) {
      patch.title = dto.title;
    }
    if (Object.prototype.hasOwnProperty.call(dto, "description")) {
      patch.description = dto.description ?? null;
    }
    return patch;
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
    this.publish(new ChatSessionCreated(sessionDto));
    return sessionDto;
  }

  async renameSession(
    id: string,
    dto: UpdateChatSessionDto
  ): Promise<ChatSessionDto> {
    const session = await this.repository.updateSessionMetadata(
      id,
      this.buildUpdatePatch(dto)
    );
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    const sessionDto = this.toDto(session);
    this.publish(new ChatSessionUpdated(sessionDto));
    return sessionDto;
  }

  async archiveSession(id: string): Promise<ChatSessionDto> {
    const session = await this.repository.updateSessionStatus(id, "archived");
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    const dto = this.toDto(session);
    this.publish(new ChatSessionUpdated(dto));
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
    this.publish(
      new ChatMessageSent(sessionDto.id, messageDto, "created", sessionDto)
    );
    this.publish(new ChatSessionUpdated(sessionDto));
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
    this.publish(new ChatMessageSent(sessionId, dto, "updated"));
    return dto;
  }

  async setAgentActivity(
    sessionId: string,
    state: AgentActivityState
  ): Promise<void> {
    await this.ensureSessionExists(sessionId);
    this.publish(
      new AgentActivity(sessionId, state, new Date().toISOString())
    );
  }

  async deleteSession(id: string): Promise<void> {
    const existing = await this.repository.getSessionById(id);
    const deleted = await this.repository.deleteSession(id);
    if (!deleted || !existing) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    await this.repository.saveAgentInvocations(id, []);
    const sessionDto = this.toDto(existing);
    this.publish(new ChatSessionUpdated(sessionDto));
    this.publish(new ChatSessionDeleted(existing.id));
  }

  private async ensureSessionExists(id: string): Promise<ChatSessionRecord> {
    const session = await this.repository.getSessionById(id);
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    return session;
  }
}
