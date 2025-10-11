import { Injectable, Logger } from "@nestjs/common";
import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
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
import { TracesService } from "../traces/traces.service";
import type { TraceDto } from "../traces/dto/trace.dto";
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
        private readonly traces: TracesService,
        private readonly logs: LogsService,
        private readonly streamRenderer: ChatSessionStreamRendererService
  ) {
    this.engine.setStreamRenderer(this.streamRenderer);
  }

  handle(event: ChatMessageCreatedEvent): void {
    const messages = this.chatSessions.listMessages(event.sessionId);
    const message = messages.find((entry) => entry.id === event.messageId);
    if (!message || !this.shouldInvokeEngine(message)) {
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
      this.chatSessions.saveAgentInvocations(message.sessionId, snapshots);

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
          this.chatSessions.updateMessageContent(
            message.sessionId,
            capture.state.messageId,
            content
          );
          streamedHandled = true;
          continue;
        }

        this.appendAssistantMessage(message.sessionId, content);
        responseCount += 1;
      }

      if (!streamedHandled && capture.state.messageId && streamedContent) {
        this.chatSessions.updateMessageContent(
          message.sessionId,
          capture.state.messageId,
          streamedContent
        );
        streamedHandled = true;
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
        `Engine execution failed for session ${ message.sessionId }: ${ reason }`,
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

      if (capture?.state.messageId) {
        this.chatSessions.updateMessageContent(
          message.sessionId,
          capture.state.messageId,
          DEFAULT_ENGINE_FAILURE_MESSAGE
        );
      } else {
        this.appendAssistantMessage(
          message.sessionId,
          DEFAULT_ENGINE_FAILURE_MESSAGE
        );
      }
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
    status: TraceDto[ "status" ],
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
    return {
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
