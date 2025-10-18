import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
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
  lastPartial?: {
    messageId: string;
    content: string;
  };
  toolTimestamps: Map<string, string>;
}

export interface StreamCaptureResult<T> {
  result?: T;
  error?: unknown;
  state: StreamState;
}

@Injectable()
export class ChatSessionStreamRendererService {
  private readonly storage = new AsyncLocalStorage<StreamState>();

  constructor(
    private readonly chatSessions: ChatSessionsService,
    private readonly eventBus: EventBus,
  ) {}

  async capture<T>(
    sessionId: string,
    handler: () => Promise<T>,
  ): Promise<StreamCaptureResult<T>> {
    const state: StreamState = {
      sessionId,
      buffer: "",
      activity: "idle",
      pending: [],
      toolTimestamps: new Map<string, string>(),
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

    await this.settlePending(state);

    return { result, error, state };
  }

  render(event: StreamEvent): void {
    const state = this.storage.getStore();

    if (state) {
      if (event.type === "tool_call" || event.type === "tool_result") {
        this.getOrCreateToolTimestamp(state, event.id ?? null);
      }
      this.enqueue(state, () => this.handleEvent(state, event));
    }

  }

  private enqueue(state: StreamState, handler: () => Promise<void>): void {
    const previous =
      state.pending.length > 0
        ? state.pending[state.pending.length - 1]
        : Promise.resolve();
    const task = previous.then(handler);
    state.pending.push(task);
  }

  private async settlePending(state: StreamState): Promise<void> {
    if (state.pending.length === 0) {
      return;
    }

    await Promise.all(state.pending);
    state.pending = [];
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

    const last = state.lastPartial;
    const next = { messageId: message.id, content: message.content };
    if (
      last &&
      last.messageId === next.messageId &&
      last.content === next.content
    ) {
      return;
    }

    state.lastPartial = next;
    this.eventBus.publish(new ChatMessagePartialEvent({ ...message }));
  }

  private emitToolCallEvent(
    state: StreamState,
    event: Extract<StreamEvent, { type: "tool_call" }>,
  ): void {
    const timestamp = this.getOrCreateToolTimestamp(state, event.id ?? null);
    this.eventBus.publish(
      new ChatSessionToolCallEvent(
        state.sessionId,
        event.id ?? undefined,
        event.name,
        this.clonePayload(event.arguments ?? null),
        timestamp,
        event.agentId ?? null,
      )
    );
  }

  private emitToolResultEvent(
    state: StreamState,
    event: Extract<StreamEvent, { type: "tool_result" }>,
  ): void {
    const timestamp = this.consumeToolTimestamp(state, event.id ?? null);
    this.eventBus.publish(
      new ChatSessionToolResultEvent(
        state.sessionId,
        event.id ?? undefined,
        event.name,
        this.clonePayload(event.result ?? null),
        timestamp,
        event.agentId ?? null,
      )
    );
  }

  private getOrCreateToolTimestamp(
    state: StreamState,
    id: string | null
  ): string {
    if (!id) {
      return new Date().toISOString();
    }

    const existing = state.toolTimestamps.get(id);
    if (existing) {
      return existing;
    }

    const timestamp = new Date().toISOString();
    state.toolTimestamps.set(id, timestamp);
    return timestamp;
  }

  private consumeToolTimestamp(state: StreamState, id: string | null): string {
    if (!id) {
      return new Date().toISOString();
    }

    const existing = state.toolTimestamps.get(id);
    if (existing) {
      state.toolTimestamps.delete(id);
      return existing;
    }

    const timestamp = new Date().toISOString();
    state.toolTimestamps.set(id, timestamp);
    return timestamp;
  }

  private clonePayload<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value !== "object") {
      return value;
    }
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
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
