import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { CreateChatSessionDto } from "./dto/create-chat-session.dto";
import {
  ChatMessageRole,
  CreateChatMessageDto,
} from "./dto/create-chat-message.dto";
import { ChatMessageDto, ChatSessionDto } from "./dto/chat-session.dto";

export interface AgentInvocationMessageSnapshot {
  role: ChatMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface AgentInvocationSnapshot {
  id: string;
  messages: AgentInvocationMessageSnapshot[];
  children: AgentInvocationSnapshot[];
}

type ChatSessionStatus = "active" | "archived";

interface ChatSessionEntity {
  id: string;
  title: string;
  description?: string;
  status: ChatSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatMessageEntity {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: Date;
  toolCallId?: string;
  name?: string;
}

export interface ChatSessionsListener {
  onSessionCreated(session: ChatSessionDto): void;
  onSessionUpdated(session: ChatSessionDto): void;
  onMessageCreated(message: ChatMessageDto): void;
  onMessageUpdated(message: ChatMessageDto): void;
}

@Injectable()
export class ChatSessionsService {
  private readonly sessions = new Map<string, ChatSessionEntity>();
  private readonly messages = new Map<string, ChatMessageEntity[]>();
  private readonly listeners = new Set<ChatSessionsListener>();
  private readonly agentInvocations = new Map<string, AgentInvocationSnapshot[]>();

  registerListener(listener: ChatSessionsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private toDto(entity: ChatSessionEntity): ChatSessionDto {
    return {
      id: entity.id,
      title: entity.title,
      description: entity.description,
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private messageToDto(entity: ChatMessageEntity): ChatMessageDto {
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
    if (invocations.length === 0) {
      this.agentInvocations.delete(sessionId);
      return;
    }
    const cloned = invocations.map((invocation) => this.cloneInvocation(invocation));
    this.agentInvocations.set(sessionId, cloned);
  }

  listAgentInvocations(sessionId: string): AgentInvocationSnapshot[] {
    const stored = this.agentInvocations.get(sessionId);
    if (!stored) {
      return [];
    }
    return stored.map((invocation) => this.cloneInvocation(invocation));
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

  listSessions(): ChatSessionDto[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((session) => this.toDto(session));
  }

  getSession(id: string): ChatSessionDto {
    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    return this.toDto(session);
  }

  createSession(dto: CreateChatSessionDto): ChatSessionDto {
    const now = new Date();
    const entity: ChatSessionEntity = {
      id: randomUUID(),
      title: dto.title,
      description: dto.description,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(entity.id, entity);
    this.messages.set(entity.id, []);
    const sessionDto = this.toDto(entity);
    this.notifySessionCreated(sessionDto);
    return sessionDto;
  }

  archiveSession(id: string): ChatSessionDto {
    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
    session.status = "archived";
    session.updatedAt = new Date();
    const dto = this.toDto(session);
    this.notifySessionUpdated(dto);
    return dto;
  }

  listMessages(sessionId: string): ChatMessageDto[] {
    this.ensureSessionExists(sessionId);
    const items = this.messages.get(sessionId) ?? [];
    return items
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((message) => this.messageToDto(message));
  }

  addMessage(
    sessionId: string,
    dto: CreateChatMessageDto
  ): { message: ChatMessageDto; session: ChatSessionDto } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Chat session ${sessionId} not found`);
    }

    const entity: ChatMessageEntity = {
      id: randomUUID(),
      sessionId,
      role: dto.role,
      content: dto.content,
      createdAt: new Date(),
      toolCallId: dto.toolCallId,
      name: dto.name,
    };

    const collection = this.messages.get(sessionId);
    if (!collection) {
      this.messages.set(sessionId, [entity]);
    } else {
      collection.push(entity);
    }

    session.updatedAt = new Date();
    const messageDto = this.messageToDto(entity);
    const sessionDto = this.toDto(session);
    this.notifyMessageCreated(messageDto);
    this.notifySessionUpdated(sessionDto);
    return { message: messageDto, session: sessionDto };
  }

  updateMessageContent(sessionId: string, messageId: string, content: string): ChatMessageDto {
    this.ensureSessionExists(sessionId);
    const collection = this.messages.get(sessionId);
    if (!collection) {
      throw new NotFoundException(`No messages stored for session ${sessionId}`);
    }

    const entity = collection.find((item) => item.id === messageId);
    if (!entity) {
      throw new NotFoundException(`Message ${messageId} not found in session ${sessionId}`);
    }

    entity.content = content;
    const dto = this.messageToDto(entity);
    this.notifyMessageUpdated(dto);
    return dto;
  }

  private ensureSessionExists(id: string): void {
    if (!this.sessions.has(id)) {
      throw new NotFoundException(`Chat session ${id} not found`);
    }
  }

  private cloneInvocation(
    invocation: AgentInvocationSnapshot
  ): AgentInvocationSnapshot {
    return {
      id: invocation.id,
      messages: invocation.messages.map((message) => ({ ...message })),
      children: invocation.children.map((child) => this.cloneInvocation(child)),
    };
  }
}
