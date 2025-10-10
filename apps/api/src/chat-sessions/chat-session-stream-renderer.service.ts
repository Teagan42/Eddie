import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { StreamRendererService } from "@eddie/io";
import type { StreamEvent } from "@eddie/types";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatMessageRole } from "./dto/create-chat-message.dto";
import { ChatMessagesGateway } from "./chat-messages.gateway";
import { ToolsGateway } from "../tools/tools.gateway";
import type { ChatMessageDto } from "./dto/chat-session.dto";

interface StreamState {
    sessionId: string;
    buffer: string;
    messageId?: string;
    pending?: Promise<void>;
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

    if (state.pending) {
      try {
        await state.pending;
      } catch (err) {
        if (!error) {
          error = err;
        }
      }
    }

    return { result, error, state };
  }

  override render(event: StreamEvent): void {
    const state = this.storage.getStore();

    if (state) {
      const previous = state.pending ?? Promise.resolve();
      state.pending = previous
        .catch(() => undefined)
        .then(() => this.handleEvent(state, event));
    }

    super.render(event);
  }

  private async handleEvent(
    state: StreamState,
    event: StreamEvent
  ): Promise<void> {
    switch (event.type) {
      case "delta": {
        if (!event.text) return;
        state.buffer += event.text;
        await this.upsertMessage(state);
        break;
      }
      case "tool_call": {
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
      case "end": {
        if (!state.messageId) return;
        const content = state.buffer.trimEnd();
        const message = await this.chatSessions.updateMessageContent(
          state.sessionId,
          state.messageId,
          content
        );
        this.emitPartial(message);
        break;
      }
      default:
        break;
    }
  }

  private async upsertMessage(state: StreamState): Promise<void> {
    if (!state.messageId) {
      const result = await this.chatSessions.addMessage(state.sessionId, {
        role: ChatMessageRole.Assistant,
        content: state.buffer,
      });
      const message = result.message;
      state.messageId = message.id;
      this.emitPartial(message);
      return;
    }

    const message = await this.chatSessions.updateMessageContent(
      state.sessionId,
      state.messageId,
      state.buffer
    );
    this.emitPartial(message);
  }

  private emitPartial(message: ChatMessageDto | undefined): void {
    if (message) this.messagesGateway.emitPartial(message);
  }
}
