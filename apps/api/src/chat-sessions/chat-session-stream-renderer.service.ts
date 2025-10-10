import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { StreamRendererService } from "@eddie/io";
import type { StreamEvent } from "@eddie/types";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatMessageRole, CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { ChatMessagesGateway } from "./chat-messages.gateway";
import type { ChatMessageDto } from "./dto/chat-session.dto";

interface StreamState {
  sessionId: string;
  buffer: string;
  messageId?: string;
  toolCallMessageIds: Record<string, string>;
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
    private readonly messagesGateway: ChatMessagesGateway
  ) {
    super();
  }

  async capture<T>(
    sessionId: string,
    handler: () => Promise<T>
  ): Promise<StreamCaptureResult<T>> {
    const state: StreamState = {
      sessionId,
      buffer: "",
      toolCallMessageIds: {},
    };
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
        if (!event.text) {
          return;
        }

        state.buffer += event.text;
        this.upsertMessage(state);
        break;
      }
      case "tool_call": {
        if (!event.id) {
          return;
        }

        if (state.toolCallMessageIds[event.id]) {
          return;
        }

        const payload: CreateChatMessageDto = {
          role: ChatMessageRole.Assistant,
          content: "",
          toolCallId: event.id,
          ...(event.name ? { name: event.name } : {}),
        };

        const { message } = this.chatSessions.addMessage(state.sessionId, payload);
        state.toolCallMessageIds[event.id] = message.id;
        this.emitPartial(message);
        break;
      }
      case "tool_result": {
        if (!event.id) {
          return;
        }

        const payload: Record<string, unknown> = {
          schema: event.result.schema,
          content: event.result.content,
        };

        if (event.result.data !== undefined) {
          payload.data = event.result.data;
        }

        if (event.result.metadata !== undefined) {
          payload.metadata = event.result.metadata;
        }

        const content = JSON.stringify(payload);
        const messagePayload: CreateChatMessageDto = {
          role: ChatMessageRole.Tool,
          content,
          toolCallId: event.id,
          ...(event.name ? { name: event.name } : {}),
        };

        const { message } = this.chatSessions.addMessage(
          state.sessionId,
          messagePayload
        );
        this.emitPartial(message);
        break;
      }
      case "end": {
        if (!state.messageId) {
          return;
        }

        const content = state.buffer.trimEnd();
        const message = this.chatSessions.updateMessageContent(
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

  private upsertMessage(state: StreamState): void {
    let message: ChatMessageDto;
    if (!state.messageId) {
      const result = this.chatSessions.addMessage(state.sessionId, {
        role: ChatMessageRole.Assistant,
        content: state.buffer,
      });
      message = result.message;
      state.messageId = message.id;
      this.emitPartial(message);
      return;
    }

    message = this.chatSessions.updateMessageContent(
      state.sessionId,
      state.messageId,
      state.buffer
    );
    this.emitPartial(message);
  }

  private emitPartial(message: ChatMessageDto | undefined): void {
    if (message) {
      this.messagesGateway.emitPartial(message);
    }
  }
}
