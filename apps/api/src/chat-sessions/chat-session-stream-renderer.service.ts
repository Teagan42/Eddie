import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { StreamRendererService } from "@eddie/io";
import type { StreamEvent } from "@eddie/types";
import {
  ChatSessionsService,
  type AgentActivityState,
} from "./chat-sessions.service";
import { ChatMessageRole } from "./dto/create-chat-message.dto";
import type { ChatMessageDto } from "./dto/chat-session.dto";
import { ChatSessionEventsService } from "./chat-session-events.service";

interface StreamState {
    sessionId: string;
    buffer: string;
    messageId?: string;
    activity: AgentActivityState;
}

export interface StreamCaptureResult<T> {
    result?: T;
    error?: unknown;
    state: StreamState;
}

@Injectable()
export class ChatSessionStreamRendererService extends StreamRendererService {
  private readonly storage = new AsyncLocalStorage<StreamState>();
  constructor(
        private readonly chatSessions: ChatSessionsService,
        private readonly events: ChatSessionEventsService,
  ) {
    super();
  }

  async capture<T>(
    sessionId: string,
    handler: () => Promise<T>,
  ): Promise<StreamCaptureResult<T>> {
    const state: StreamState = { sessionId, buffer: "", activity: "idle" };
    let result: T | undefined;
    let error: unknown;

    await this.storage.run(state, async () => {
      this.updateActivity(state, "thinking");
      try {
        result = await handler();
      } catch (err) {
        error = err;
      }
    });

    return { result, error, state };
  }

  override render(event: StreamEvent): void {
    const state = this.storage.getStore();

    if (state) {
      this.handleEvent(state, event);
    }

    super.render(event);
  }

  private handleEvent(state: StreamState, event: StreamEvent): void {
    switch (event.type) {
      case "delta": {
        if (!event.text) return;
        state.buffer += event.text;
        this.updateActivity(state, "thinking");
        this.upsertMessage(state);
        break;
      }
      case "tool_call": {
        this.updateActivity(state, "tool");
        this.emitToolCallEvent(state, event);
        break;
      }
      case "tool_result": {
        this.updateActivity(state, "thinking");
        this.emitToolResultEvent(state, event);
        break;
      }
      case "notification": {
        const metadata = event.metadata as { severity?: string } | undefined;
        if (metadata?.severity === "error") {
          this.updateActivity(state, "error");
        }
        break;
      }
      case "error": {
        this.updateActivity(state, "error");
        break;
      }
      case "end": {
        if (!state.messageId) return;
        const content = state.buffer.trimEnd();
        const message = this.chatSessions.updateMessageContent(
          state.sessionId,
          state.messageId,
          content,
        );
        this.emitPartial(message);
        this.updateActivity(state, "idle");
        break;
      }
      default:
        break;
    }
  }

  private upsertMessage(state: StreamState): void {
    if (!state.messageId) {
      const result = this.chatSessions.addMessage(state.sessionId, {
        role: ChatMessageRole.Assistant,
        content: state.buffer,
      });
      const message = result.message;
      state.messageId = message.id;
      this.emitPartial(message);
      return;
    }

    const message = this.chatSessions.updateMessageContent(
      state.sessionId,
      state.messageId,
      state.buffer,
    );
    this.emitPartial(message);
  }

  private emitPartial(message: ChatMessageDto | undefined): void {
    if (message) this.events.emitPartial(message);
  }

  private emitToolCallEvent(
    state: StreamState,
    event: Extract<StreamEvent, { type: "tool_call" }>,
  ): void {
    this.events.emitToolCall({
      sessionId: state.sessionId,
      id: event.id ?? undefined,
      name: event.name,
      arguments: event.arguments ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  private emitToolResultEvent(
    state: StreamState,
    event: Extract<StreamEvent, { type: "tool_result" }>,
  ): void {
    this.events.emitToolResult({
      sessionId: state.sessionId,
      id: event.id ?? undefined,
      name: event.name,
      result: event.result ?? null,
      timestamp: new Date().toISOString(),
    });
  }

  private updateActivity(state: StreamState, next: AgentActivityState): void {
    if (state.activity === next) {
      return;
    }
    state.activity = next;
    this.chatSessions.setAgentActivity(state.sessionId, next);
  }
}
