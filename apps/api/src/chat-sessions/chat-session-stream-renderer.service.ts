import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { StreamRendererService } from "@eddie/io";
import type { StreamEvent } from "@eddie/types";
import {
  ChatMessagePartialEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
} from "@eddie/types";
import { ChatSessionsService } from "./chat-sessions.service";
import type { AgentActivityState } from "./chat-session.types";
import { ChatMessageRole } from "./dto/create-chat-message.dto";
import type { ChatMessageDto } from "./dto/chat-session.dto";

interface StreamState {
    sessionId: string;
    buffer: string;
    messageId?: string;
    activity: AgentActivityState;
    pending: Promise<void>[];
    lastEmittedContent?: string;
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
        private readonly eventBus: EventBus,
  ) {
    super();
  }

  async capture<T>(
    sessionId: string,
    handler: () => Promise<T>,
  ): Promise<StreamCaptureResult<T>> {
    const state: StreamState = {
      sessionId,
      buffer: "",
      activity: "idle",
      pending: [],
    };
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

    await Promise.all(state.pending);

    return { result, error, state };
  }

  override render(event: StreamEvent): void {
    const state = this.storage.getStore();

    if (state) {
      const previous =
        state.pending.length > 0
          ? state.pending[state.pending.length - 1]
          : Promise.resolve();
      const task = previous.then(() => this.handleEvent(state, event));
      state.pending.push(task);
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
        await this.updateActivity(state, "thinking");
        await this.upsertMessage(state);
        break;
      }
      case "tool_call": {
        await this.updateActivity(state, "tool");
        this.emitToolCallEvent(state, event);
        break;
      }
      case "tool_result": {
        await this.updateActivity(state, "thinking");
        this.emitToolResultEvent(state, event);
        break;
      }
      case "notification": {
        const metadata = event.metadata as { severity?: string } | undefined;
        if (metadata?.severity === "error") {
          await this.updateActivity(state, "error");
        }
        break;
      }
      case "error": {
        await this.updateActivity(state, "error");
        break;
      }
      case "end": {
        if (!state.messageId) return;
        const content = state.buffer.trimEnd();
        if (content !== state.buffer) {
          const message = await this.chatSessions.updateMessageContent(
            state.sessionId,
            state.messageId,
            content
          );
          state.buffer = content;
          this.emitPartial(state, message);
        }
        await this.updateActivity(state, "idle");
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
      this.emitPartial(state, message);
      return;
    }

    const message = await this.chatSessions.updateMessageContent(
      state.sessionId,
      state.messageId,
      state.buffer
    );
    this.emitPartial(state, message);
  }

  private emitPartial(
    state: StreamState,
    message: ChatMessageDto | undefined
  ): void {
    if (!message) {
      return;
    }
    if (message.content === state.lastEmittedContent) {
      return;
    }
    state.lastEmittedContent = message.content;
    this.eventBus.publish(new ChatMessagePartialEvent(message));
  }

  private emitToolCallEvent(
    state: StreamState,
    event: Extract<StreamEvent, { type: "tool_call" }>,
  ): void {
    this.eventBus.publish(
      new ChatSessionToolCallEvent(
        state.sessionId,
        event.id ?? undefined,
        event.name,
        event.arguments ?? null,
        new Date().toISOString(),
      )
    );
  }

  private emitToolResultEvent(
    state: StreamState,
    event: Extract<StreamEvent, { type: "tool_result" }>,
  ): void {
    this.eventBus.publish(
      new ChatSessionToolResultEvent(
        state.sessionId,
        event.id ?? undefined,
        event.name,
        event.result ?? null,
        new Date().toISOString(),
      )
    );
  }

  private async updateActivity(
    state: StreamState,
    next: AgentActivityState
  ): Promise<void> {
    if (state.activity === next) {
      return;
    }
    state.activity = next;
    await this.chatSessions.setAgentActivity(state.sessionId, next);
  }
}
