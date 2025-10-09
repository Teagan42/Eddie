import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EngineService } from "@eddie/engine";
import type { ChatMessage } from "@eddie/types";
import {
  ChatSessionsListener,
  ChatSessionsService,
} from "./chat-sessions.service";
import { ChatMessageDto } from "./dto/chat-session.dto";
import { ChatMessageRole, CreateChatMessageDto } from "./dto/create-chat-message.dto";

const DEFAULT_ENGINE_FAILURE_MESSAGE =
  "Engine failed to respond. Check server logs for details.";

@Injectable()
export class ChatSessionsEngineListener
  implements ChatSessionsListener, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ChatSessionsEngineListener.name);
  private unregister: (() => void) | null = null;

  constructor(
    private readonly chatSessions: ChatSessionsService,
    private readonly engine: EngineService
  ) {}

  onModuleInit(): void {
    this.unregister = this.chatSessions.registerListener(this);
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.unregister = null;
  }

  onSessionCreated(): void {
    // No engine side-effects for session creation events.
  }

  onSessionUpdated(): void {
    // No engine side-effects for session updates.
  }

  onMessageCreated(message: ChatMessageDto): void {
    if (!this.shouldInvokeEngine(message)) {
      return;
    }

    void this.executeEngine(message);
  }

  private shouldInvokeEngine(message: ChatMessageDto): boolean {
    return (
      message.role === ChatMessageRole.User ||
      message.role === ChatMessageRole.System
    );
  }

  private async executeEngine(message: ChatMessageDto): Promise<void> {
    const history = this.createHistory(message);

    try {
      const result = await this.engine.run(message.content, {
        history,
        autoApprove: true,
        nonInteractive: true,
      });

      const baseline = history.length + 2;
      const novelMessages = result.messages.slice(baseline);

      for (const entry of novelMessages) {
        if (entry.role !== "assistant") {
          continue;
        }

        const content = entry.content?.trim();
        if (!content) {
          continue;
        }

        this.appendAssistantMessage(message.sessionId, content);
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : DEFAULT_ENGINE_FAILURE_MESSAGE;

      this.logger.error(
        `Engine execution failed for session ${message.sessionId}: ${reason}`,
        error instanceof Error ? error.stack : undefined
      );

      this.appendAssistantMessage(message.sessionId, DEFAULT_ENGINE_FAILURE_MESSAGE);
    }
  }

  private createHistory(message: ChatMessageDto): ChatMessage[] {
    return this.chatSessions
      .listMessages(message.sessionId)
      .filter((entry) => entry.id !== message.id)
      .map<ChatMessage>((entry) => ({
        role: entry.role,
        content: entry.content,
        ...(entry.name ? { name: entry.name } : {}),
        ...(entry.toolCallId ? { tool_call_id: entry.toolCallId } : {}),
      }));
  }

  private appendAssistantMessage(sessionId: string, content: string): void {
    const payload: CreateChatMessageDto = {
      role: ChatMessageRole.Assistant,
      content,
    };

    this.chatSessions.addMessage(sessionId, payload);
  }
}
