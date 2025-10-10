import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { StreamRendererService } from "@eddie/io";
import type { StreamEvent } from "@eddie/types";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatMessageRole } from "./dto/create-chat-message.dto";
import type { ChatMessageDto } from "./dto/chat-session.dto";
import { ChatSessionEventsService } from "./chat-session-events.service";

interface StreamState {
    sessionId: string;
    buffer: string;
    messageId?: string;
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
    const state: StreamState = { sessionId, buffer: "" };
    let result: T | undefined;
    let error: unknown;

    await this.storage.run(state, async () => {
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
        this.upsertMessage(state);
        break;
      }
      case "tool_call": {
        this.events.emitToolCall({
          sessionId: state.sessionId,
          id: event.id ?? undefined,
          name: event.name,
          arguments: event.arguments ?? null,
          timestamp: new Date().toISOString(),
        });
        break;
      }
      case "tool_result": {
        this.events.emitToolResult({
          sessionId: state.sessionId,
          id: event.id ?? undefined,
          name: event.name,
          result: event.result ?? null,
          timestamp: new Date().toISOString(),
        });
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
}
