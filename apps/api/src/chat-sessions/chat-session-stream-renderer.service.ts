import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { StreamRendererService } from "@eddie/io";
import type { StreamEvent } from "@eddie/types";
import {
  ChatSessionsService,
  type AgentActivityState,
} from "./chat-sessions.service";
import { ChatMessageRole } from "./dto/create-chat-message.dto";
import { ChatMessagesGateway } from "./chat-messages.gateway";
import { ToolsGateway } from "../tools/tools.gateway";
import type { ChatMessageDto } from "./dto/chat-session.dto";

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
        private readonly messagesGateway: ChatMessagesGateway,
        private readonly toolsGateway?: ToolsGateway,
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
        if (!this.toolsGateway) break;
        try {
          this.toolsGateway.emitToolCall({
            sessionId: state.sessionId,
            id: event.id ?? undefined,
            name: event.name,
            arguments: event.arguments ?? null,
            timestamp: new Date().toISOString(),
          });
        } catch {
          // ignore gateway errors to keep stream rendering robust
        }
        break;
      }
      case "tool_result": {
        this.updateActivity(state, "thinking");
        if (!this.toolsGateway) break;
        try {
          this.toolsGateway.emitToolResult({
            sessionId: state.sessionId,
            id: event.id ?? undefined,
            name: event.name,
            result: event.result ?? null,
            timestamp: new Date().toISOString(),
          });
        } catch {
          // ignore
        }
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
    if (message) this.messagesGateway.emitPartial(message);
  }

  private updateActivity(state: StreamState, next: AgentActivityState): void {
    if (state.activity === next) {
      return;
    }
    state.activity = next;
    this.chatSessions.setAgentActivity(state.sessionId, next);
  }
}
