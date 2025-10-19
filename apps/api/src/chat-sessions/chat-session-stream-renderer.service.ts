import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import type { StreamEvent } from "@eddie/types";
import {
  ChatMessagePartialEvent,
  ChatMessageReasoningCompleteEvent,
  ChatMessageReasoningPartialEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
} from "@eddie/types";
import { ChatSessionsService } from "./chat-sessions.service";
import type { AgentActivityState } from "./chat-session.types";
import { ChatMessageRole } from "./dto/create-chat-message.dto";
import type { ChatMessageDto } from "./dto/chat-session.dto";

type ReasoningId = string | null;

interface ReasoningBuffer {
  id: ReasoningId;
  text: string;
  metadata?: Record<string, unknown>;
  messageId?: string;
  agentId: string | null | undefined;
  emittedText?: string;
}

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
  reasoning: Map<ReasoningId, ReasoningBuffer>;
  lastReasoningId: ReasoningId;
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
      reasoning: new Map<ReasoningId, ReasoningBuffer>(),
      lastReasoningId: null,
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
      case "reasoning_delta": {
        await this.handleReasoningDelta(state, event);
        break;
      }
      case "reasoning_end": {
        await this.handleReasoningEnd(state, event);
        break;
      }
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
    const reasoningId: ReasoningId = event.id ?? null;
    const buffer = this.getOrCreateReasoningBuffer(state, reasoningId, event.agentId ?? null);
    buffer.agentId = event.agentId ?? buffer.agentId ?? null;
    if (event.text) {
      buffer.text += event.text;
    }
    buffer.metadata = event.metadata ?? buffer.metadata;
    state.lastReasoningId = reasoningId;

    if (this.linkReasoningBufferToCurrentMessage(state, buffer)) {
      this.emitReasoningPartial(state, buffer);
    }
  }

  private async handleReasoningEnd(
    state: StreamState,
    event: Extract<StreamEvent, { type: "reasoning_end" }>,
  ): Promise<void> {
    const reasoningId: ReasoningId = state.lastReasoningId ?? null;
    const buffer = state.reasoning.get(reasoningId);

    if (!buffer) {
      state.reasoning.delete(reasoningId);
      state.lastReasoningId = null;
      return;
    }

    buffer.metadata = event.metadata ?? buffer.metadata;
    buffer.agentId = event.agentId ?? buffer.agentId ?? null;

    if (this.linkReasoningBufferToCurrentMessage(state, buffer)) {
      this.emitReasoningPartial(state, buffer);
      this.emitReasoningComplete(state, buffer, event.responseId);
    }

    state.reasoning.delete(reasoningId);
    state.lastReasoningId = null;
  }

  private getOrCreateReasoningBuffer(
    state: StreamState,
    reasoningId: ReasoningId,
    agentId: string | null,
  ): ReasoningBuffer {
    const existing = state.reasoning.get(reasoningId);
    if (existing) {
      existing.agentId = agentId ?? existing.agentId ?? null;
      return existing;
    }

    const buffer: ReasoningBuffer = {
      id: reasoningId,
      text: "",
      agentId,
    };
    state.reasoning.set(reasoningId, buffer);
    return buffer;
  }

  private emitReasoningPartial(state: StreamState, buffer: ReasoningBuffer): void {
    if (!buffer.messageId) {
      return;
    }

    if (buffer.text.length === 0 || buffer.text === buffer.emittedText) {
      return;
    }

    buffer.emittedText = buffer.text;

    this.eventBus.publish(
      new ChatMessageReasoningPartialEvent(
        state.sessionId,
        buffer.id ?? undefined,
        buffer.messageId,
        buffer.text,
        buffer.metadata,
        buffer.agentId ?? null,
      )
    );
  }

  private emitReasoningComplete(
    state: StreamState,
    buffer: ReasoningBuffer,
    responseId: string | undefined,
  ): void {
    if (!buffer.messageId) {
      return;
    }

    this.eventBus.publish(
      new ChatMessageReasoningCompleteEvent(
        state.sessionId,
        buffer.id ?? undefined,
        buffer.messageId,
        responseId,
        buffer.text,
        buffer.metadata,
        buffer.agentId ?? null,
      )
    );
  }

  private attachReasoningBuffersToMessage(state: StreamState): void {
    for (const buffer of state.reasoning.values()) {
      if (this.linkReasoningBufferToCurrentMessage(state, buffer) && buffer.text.length > 0) {
        this.emitReasoningPartial(state, buffer);
      }
    }
  }

  private linkReasoningBufferToCurrentMessage(
    state: StreamState,
    buffer: ReasoningBuffer,
  ): boolean {
    if (state.messageId && buffer.messageId !== state.messageId) {
      buffer.messageId = state.messageId;
    }
    return buffer.messageId !== undefined;
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
      this.attachReasoningBuffersToMessage(state);
      return;
    }

    const message = await this.chatSessions.updateMessageContent(
      state.sessionId,
      state.messageId,
      state.buffer
    );
    this.emitPartial(state, message);
    if (message) {
      this.attachReasoningBuffersToMessage(state);
    }
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
