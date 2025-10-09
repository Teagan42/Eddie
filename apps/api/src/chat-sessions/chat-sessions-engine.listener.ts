import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EngineService } from "@eddie/engine";
import type { ChatMessage } from "@eddie/types";
import {
  ChatSessionsListener,
  ChatSessionsService,
} from "./chat-sessions.service";
import { ChatMessageDto } from "./dto/chat-session.dto";
import { ChatMessageRole, CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { TracesService } from "../traces/traces.service";
import type { TraceDto } from "../traces/dto/trace.dto";
import { LogsService } from "../logs/logs.service";
import type { LogEntryDto } from "../logs/dto/log-entry.dto";

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
    private readonly engine: EngineService,
    private readonly traces: TracesService,
    private readonly logs: LogsService
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
    const trace = this.createTrace(message);
    const startedAt = Date.now();

    this.appendLog("info", "Engine run started", {
      sessionId: message.sessionId,
      messageId: message.id,
    });

    try {
      const result = await this.engine.run(message.content, {
        history,
        autoApprove: true,
        nonInteractive: true,
      });

      const baseline = history.length + 2;
      const novelMessages = result.messages.slice(baseline);

      let responseCount = 0;
      for (const entry of novelMessages) {
        if (entry.role !== "assistant") {
          continue;
        }

        const content = entry.content?.trim();
        if (!content) {
          continue;
        }

        this.appendAssistantMessage(message.sessionId, content);
        responseCount += 1;
      }

      const duration = Date.now() - startedAt;
      this.updateTrace(trace, "completed", duration, {
        responseCount,
      });
      this.appendLog("info", "Engine run completed", {
        sessionId: message.sessionId,
        messageId: message.id,
        responseCount,
        durationMs: duration,
      });
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : DEFAULT_ENGINE_FAILURE_MESSAGE;

      this.logger.error(
        `Engine execution failed for session ${message.sessionId}: ${reason}`,
        error instanceof Error ? error.stack : undefined
      );

      this.updateTrace(trace, "failed", undefined, {
        error: reason,
      });
      this.appendLog("error", "Engine run failed", {
        sessionId: message.sessionId,
        messageId: message.id,
        error: reason,
      });

      this.appendAssistantMessage(
        message.sessionId,
        DEFAULT_ENGINE_FAILURE_MESSAGE
      );
    }
  }

  private createTrace(message: ChatMessageDto): TraceDto | null {
    try {
      return this.traces.create({
        sessionId: message.sessionId,
        name: "engine.run",
        status: "running",
        metadata: {
          messageId: message.id,
        },
      });
    } catch (error) {
      this.logger.warn(
        {
          sessionId: message.sessionId,
          messageId: message.id,
          error,
        },
        "Failed to create engine trace"
      );
      return null;
    }
  }

  private updateTrace(
    trace: TraceDto | null,
    status: TraceDto["status"],
    durationMs: number | undefined,
    metadata: Record<string, unknown>
  ): void {
    if (!trace) {
      return;
    }

    try {
      this.traces.updateStatus(trace.id, status, durationMs, {
        ...(trace.metadata ?? {}),
        ...metadata,
      });
    } catch (error) {
      this.logger.warn(
        {
          traceId: trace.id,
          status,
          durationMs,
          metadata,
          error,
        },
        "Failed to update engine trace"
      );
    }
  }

  private appendLog(
    level: LogEntryDto["level"],
    message: string,
    context: Record<string, unknown>
  ): void {
    try {
      this.logs.append(level, message, context);
    } catch (error) {
      this.logger.warn(
        {
          level,
          message,
          context,
          error,
        },
        "Failed to append engine log entry"
      );
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
