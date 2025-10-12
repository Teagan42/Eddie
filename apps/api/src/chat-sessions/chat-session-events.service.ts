import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { ChatMessagesGateway } from "./chat-messages.gateway";
import { ToolsGateway } from "../tools/tools.gateway";
import type { ChatMessageDto } from "./dto/chat-session.dto";
import {
  ChatMessagePartialEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
} from "@eddie/types";

@Injectable()
@EventsHandler(
  ChatMessagePartialEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
)
export class ChatSessionEventsService
implements
    IEventHandler<
      | ChatMessagePartialEvent
      | ChatSessionToolCallEvent
      | ChatSessionToolResultEvent
    > {
  constructor(
    @Inject(forwardRef(() => ChatMessagesGateway)) private readonly messagesGateway: ChatMessagesGateway,
    @Inject(forwardRef(() => ToolsGateway)) private readonly toolsGateway?: ToolsGateway,
  ) { }

  handle(
    event:
      | ChatMessagePartialEvent
      | ChatSessionToolCallEvent
      | ChatSessionToolResultEvent
  ): void {
    if (event instanceof ChatMessagePartialEvent) {
      this.emitPartial(event.message as ChatMessageDto);
      return;
    }

    if (event instanceof ChatSessionToolCallEvent) {
      this.emitToolCall({
        sessionId: event.sessionId,
        id: event.id,
        name: event.name,
        arguments: event.arguments,
        timestamp: event.timestamp,
      });
      return;
    }

    if (event instanceof ChatSessionToolResultEvent) {
      this.emitToolResult({
        sessionId: event.sessionId,
        id: event.id,
        name: event.name,
        result: event.result,
        timestamp: event.timestamp,
      });
    }
  }

  private emitPartial(message: ChatMessageDto): void {
    try {
      this.messagesGateway.emitPartial(message);
    } catch {
      // Ignore gateway errors to keep stream rendering resilient.
    }
  }

  private emitToolCall(payload: {
    sessionId: string;
    id?: string;
    name?: string;
    arguments?: unknown;
    timestamp?: string;
  }): void {
    if (!this.toolsGateway) return;
    try {
      this.toolsGateway.emitToolCall(payload);
    } catch {
      // Ignore to isolate transport concerns.
    }
  }

  private emitToolResult(payload: {
    sessionId: string;
    id?: string;
    name?: string;
    result?: unknown;
    timestamp?: string;
  }): void {
    if (!this.toolsGateway) return;
    try {
      this.toolsGateway.emitToolResult(payload);
    } catch {
      // Ignore to isolate transport concerns.
    }
  }
}
