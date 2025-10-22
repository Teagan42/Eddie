import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import type { StreamEvent } from "@eddie/types";
import {
  ChatMessagePartialEvent,
  ChatMessageReasoningCompleteEvent,
  ChatMessageReasoningDeltaEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
  type AgentActivityState,
} from "@eddie/types";
import { ChatSessionsService } from "./chat-sessions.service";
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
  reasoning?: ReasoningState;
}

interface ReasoningState {
  id?: string;
  buffer: string;
  lastEmitted?: string;
  metadata?: Record<string, unknown> | undefined;
  agentId?: string | null;
  messageId?: string;
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
  ) { }

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
      case "reasoning_delta": {
        await this.updateActivity(state, "thinking");
        await this.handleReasoningDelta(state, event);
        break;
      }
      case "reasoning_end": {
        await this.handleReasoningEnd(state, event);
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
        const metadata = event.metadata as {
          severity?: string;
          tool?: unknown;
          tool_call_id?: unknown;
        } | undefined;
        if (metadata?.severity === "error") {
          const isToolNotification =
            typeof metadata.tool === "string" ||
            typeof metadata.tool_call_id === "string";
          await this.updateActivity(state, isToolNotification ? "tool-error" : "error");
        }
        break;
      }
      case "error": {
        if (state.activity !== "tool-error") {
          await this.updateActivity(state, "error");
        }
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
        state.reasoning = undefined;
        break;
      }
      default:
        break;
    }
  }

  private async handleReasoningDelta(
    state: StreamState,
    event: Extract<StreamEvent, { type: "reasoning_delta" }>,
  ): Promise<void> {
    if (!event.text) {
      return;
    }

    const messageId = await this.ensureReasoningMessage(state);
    const reasoning = this.getOrCreateReasoningState(state, event.id);
    reasoning.messageId = messageId;
    reasoning.buffer += event.text;
    reasoning.metadata = event.metadata;
    reasoning.agentId = event.agentId ?? null;

    if (reasoning.lastEmitted === reasoning.buffer) {
      return;
    }

    reasoning.lastEmitted = reasoning.buffer;

    const timestamp = this.now();
    this.eventBus.publish(
      new ChatMessageReasoningDeltaEvent(
        state.sessionId,
        messageId,
        reasoning.buffer,
        event.metadata,
        timestamp,
        event.agentId ?? null,
      )
    );
  }

  private async handleReasoningEnd(
    state: StreamState,
    event: Extract<StreamEvent, { type: "reasoning_end" }>,
  ): Promise<void> {
    const messageId = await this.ensureReasoningMessage(state);
    const reasoning = state.reasoning;
    const timestamp = this.now();
    const {
      buffer: reasoningText,
      metadata: reasoningMetadata,
      agentId: reasoningAgentId,
    } = reasoning ?? { buffer: undefined, metadata: undefined, agentId: null };
    const text = reasoningText;
    const metadata = event.metadata ?? reasoningMetadata;
    const agentId = event.agentId ?? reasoningAgentId ?? null;

    this.eventBus.publish(
      new ChatMessageReasoningCompleteEvent(
        state.sessionId,
        messageId,
        event.responseId,
        text,
        metadata,
        timestamp,
        agentId,
      )
    );

    state.reasoning = undefined;
  }

  private async ensureReasoningMessage(state: StreamState): Promise<string> {
    if (state.messageId) {
      return state.messageId;
    }

    const result = await this.chatSessions.addMessage(state.sessionId, {
      role: ChatMessageRole.Assistant,
      content: state.buffer,
    });
    const message = result.message;
    state.messageId = message.id;
    state.lastPartial = { messageId: message.id, content: state.buffer };
    return message.id;
  }

  private getOrCreateReasoningState(
    state: StreamState,
    id: string | undefined,
  ): ReasoningState {
    const existing = state.reasoning;
    if (existing && (id === undefined || existing.id === id)) {
      return existing;
    }

    const next: ReasoningState = {
      id,
      buffer: "",
      lastEmitted: undefined,
      metadata: undefined,
      agentId: existing?.agentId ?? null,
      messageId: existing?.messageId ?? state.messageId,
    };
    state.reasoning = next;
    return next;
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
      return this.now();
    }

    const existing = state.toolTimestamps.get(id);
    if (existing) {
      return existing;
    }

    const timestamp = this.now();
    state.toolTimestamps.set(id, timestamp);
    return timestamp;
  }

  private consumeToolTimestamp(state: StreamState, id: string | null): string {
    if (!id) {
      return this.now();
    }

    const existing = state.toolTimestamps.get(id);
    if (existing) {
      state.toolTimestamps.delete(id);
      return existing;
    }

    const timestamp = this.now();
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

  private now(): string {
    return new Date().toISOString();
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
