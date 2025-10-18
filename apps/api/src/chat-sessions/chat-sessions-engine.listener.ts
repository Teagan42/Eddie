import { Injectable, Logger } from "@nestjs/common";
import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { EngineService } from "@eddie/engine";
import type { AgentInvocation, EngineResult } from "@eddie/engine";
import type { ChatMessage } from "@eddie/types";
import {
  ChatSessionsService,
  type AgentInvocationSnapshot,
} from "./chat-sessions.service";
import {
  ChatSessionStreamRendererService,
  StreamCaptureResult,
} from "./chat-session-stream-renderer.service";
import { ChatMessageDto } from "./dto/chat-session.dto";
import { ChatMessageRole, CreateChatMessageDto } from "./dto/create-chat-message.dto";
import type { TraceDto } from "../traces/dto/trace.dto";
import { CreateTraceCommand, UpdateTraceCommand } from "../traces/commands";
import { LogsService } from "../logs/logs.service";
import type { LogEntryDto } from "../logs/dto/log-entry.dto";
import { ChatMessageCreatedEvent } from "@eddie/types";

const DEFAULT_ENGINE_FAILURE_MESSAGE =
    "Engine failed to respond. Check server logs for details.";

@EventsHandler(ChatMessageCreatedEvent)
@Injectable()
export class ChatSessionsEngineListener
implements IEventHandler<ChatMessageCreatedEvent> {
  private readonly logger = new Logger(ChatSessionsEngineListener.name);

  constructor(
    private readonly chatSessions: ChatSessionsService,
    private readonly engine: EngineService,
    private readonly commandBus: CommandBus,
    private readonly logs: LogsService,
    private readonly streamRenderer: ChatSessionStreamRendererService
  ) {}

  async handle(event: ChatMessageCreatedEvent): Promise<void> {
    await this.processMessage(event.sessionId, event.messageId);
  }

  private async processMessage(
    sessionId: string,
    messageId: string
  ): Promise<void> {
    const messages = await this.chatSessions.listMessages(sessionId);
    const message = messages.find((entry) => entry.id === messageId);
    if (!message || !this.shouldInvokeEngine(message)) {
      return;
    }

    await this.executeEngine(message, messages);
  }

  private shouldInvokeEngine(message: ChatMessageDto): boolean {
    return (
      message.role === ChatMessageRole.User ||
      message.role === ChatMessageRole.System
    );
  }

  private async executeEngine(
    message: ChatMessageDto,
    messages: ChatMessageDto[]
  ): Promise<void> {
    const history = this.createHistory(messages, message.id);
    const trace = await this.createTrace(message);
    const startedAt = Date.now();

    this.appendLog("info", "Engine run started", {
      sessionId: message.sessionId,
      messageId: message.id,
    });

    let capture: StreamCaptureResult<EngineResult> | undefined;

    try {
      capture = await this.streamRenderer.capture(message.sessionId, () =>
        this.engine.run(message.content, {
          history,
          autoApprove: true,
          nonInteractive: true,
        })
      );

      if (capture.error) {
        throw capture.error;
      }

      const result = capture.result!;
      const snapshots = this.snapshotAgentInvocations(result.agents);
      await this.chatSessions.saveAgentInvocations(
        message.sessionId,
        snapshots
      );

      const baseline = history.length + 2;
      const novelMessages = result.messages.slice(baseline);

      const streamedContent = capture.state.buffer.trim();
      let streamedHandled =
                !capture.state.messageId || streamedContent.length === 0;
      let responseCount =
                capture.state.messageId && streamedContent.length > 0 ? 1 : 0;

      for (const entry of novelMessages) {
        if (entry.role !== "assistant") {
          continue;
        }

        const content = entry.content?.trim();
        if (!content) {
          continue;
        }

        if (!streamedHandled && capture.state.messageId) {
          await this.chatSessions.updateMessageContent(
            message.sessionId,
            capture.state.messageId,
            content
          );
          streamedHandled = true;
          continue;
        }

        await this.appendAssistantMessage(message.sessionId, content);
        responseCount += 1;
      }

      if (!streamedHandled && capture.state.messageId && streamedContent) {
        await this.chatSessions.updateMessageContent(
          message.sessionId,
          capture.state.messageId,
          streamedContent
        );
        streamedHandled = true;
      }

      const duration = Date.now() - startedAt;
      await this.updateTrace(trace, "completed", duration, {
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
        `Engine execution failed for session ${ message.sessionId }: ${ reason }`,
        error instanceof Error ? error.stack : undefined
      );

      await this.updateTrace(trace, "failed", undefined, {
        error: reason,
      });
      this.appendLog("error", "Engine run failed", {
        sessionId: message.sessionId,
        messageId: message.id,
        error: reason,
      });

      if (capture?.state.messageId) {
        await this.chatSessions.updateMessageContent(
          message.sessionId,
          capture.state.messageId,
          DEFAULT_ENGINE_FAILURE_MESSAGE
        );
      } else {
        await this.appendAssistantMessage(
          message.sessionId,
          DEFAULT_ENGINE_FAILURE_MESSAGE
        );
      }
    }
  }

  private async createTrace(message: ChatMessageDto): Promise<TraceDto | null> {
    try {
      return await this.commandBus.execute(
        new CreateTraceCommand({
          sessionId: message.sessionId,
          name: "engine.run",
          status: "running",
          metadata: {
            messageId: message.id,
          },
        })
      );
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

  private async updateTrace(
    trace: TraceDto | null,
    status: TraceDto[ "status" ],
    durationMs: number | undefined,
    metadata: Record<string, unknown>
  ): Promise<void> {
    if (!trace) {
      return;
    }

    try {
      const nextMetadata = {
        ...(trace.metadata ?? {}),
        ...metadata,
      };
      await this.commandBus.execute(
        new UpdateTraceCommand(trace.id, {
          status,
          durationMs,
          metadata: nextMetadata,
        })
      );
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
    level: LogEntryDto[ "level" ],
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

  private createHistory(
    messages: ChatMessageDto[],
    messageId: string
  ): ChatMessage[] {
    return messages
      .filter((entry) => entry.id !== messageId)
      .map<ChatMessage>((entry) => ({
        role: entry.role,
        content: entry.content,
        ...(entry.name ? { name: entry.name } : {}),
        ...(entry.toolCallId ? { tool_call_id: entry.toolCallId } : {}),
      }));
  }

  private async appendAssistantMessage(
    sessionId: string,
    content: string
  ): Promise<void> {
    const payload: CreateChatMessageDto = {
      role: ChatMessageRole.Assistant,
      content,
    };

    await this.chatSessions.addMessage(sessionId, payload);
  }

  private snapshotAgentInvocations(
    agents: AgentInvocation[]
  ): AgentInvocationSnapshot[] {
    if (!agents || agents.length === 0) {
      return [];
    }

    const roots = agents.filter((agent) => !agent.parent);
    return roots.map((agent) => this.snapshotInvocation(agent));
  }

  private snapshotInvocation(
    agent: AgentInvocation
  ): AgentInvocationSnapshot {
    const runtime = agent.runtime;
    const snapshot: AgentInvocationSnapshot = {
      id: agent.id,
      messages: agent.messages.map((message) => ({
        role: this.toChatMessageRole(message.role),
        content: message.content,
        ...(message.name ? { name: message.name } : {}),
        ...(message.tool_call_id
          ? { toolCallId: message.tool_call_id }
          : {}),
      })),
      children: agent.children.map((child) => this.snapshotInvocation(child)),
    };

    if (runtime?.provider) {
      snapshot.provider = runtime.provider;
    }
    if (runtime?.model) {
      snapshot.model = runtime.model;
    }

    return snapshot;
  }

  private toChatMessageRole(role: ChatMessage[ "role" ]): ChatMessageRole {
    switch (role) {
      case "assistant":
        return ChatMessageRole.Assistant;
      case "system":
        return ChatMessageRole.System;
      case "tool":
        return ChatMessageRole.Tool;
      case "user":
      default:
        return ChatMessageRole.User;
    }
  }
}
