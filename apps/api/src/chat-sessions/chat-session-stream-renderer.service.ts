import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { StreamRendererService } from "@eddie/io";
import type { StreamEvent } from "@eddie/types";
import { ChatSessionsService } from "./chat-sessions.service";
import { ChatMessageRole } from "./dto/create-chat-message.dto";

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

  constructor(private readonly chatSessions: ChatSessionsService) {
    super();
  }

  async capture<T>(
    sessionId: string,
    handler: () => Promise<T>
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
        if (!event.text) {
          return;
        }

        state.buffer += event.text;
        this.upsertMessage(state);
        break;
      }
      case "end": {
        if (!state.messageId) {
          return;
        }

        const content = state.buffer.trimEnd();
        this.chatSessions.updateMessageContent(
          state.sessionId,
          state.messageId,
          content
        );
        break;
      }
      default:
        break;
    }
  }

  private upsertMessage(state: StreamState): void {
    if (!state.messageId) {
      const { message } = this.chatSessions.addMessage(state.sessionId, {
        role: ChatMessageRole.Assistant,
        content: state.buffer,
      });
      state.messageId = message.id;
      return;
    }

    this.chatSessions.updateMessageContent(
      state.sessionId,
      state.messageId,
      state.buffer
    );
  }
}
