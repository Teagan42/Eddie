import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ChatMessagesGateway } from "./chat-messages.gateway";
import { ToolsGateway } from "../tools/tools.gateway";
import type { ChatMessageDto } from "./dto/chat-session.dto";

export interface ChatSessionToolCallEvent {
  sessionId: string;
  id?: string;
  name?: string;
  arguments?: unknown;
  timestamp?: string;
}

export interface ChatSessionToolResultEvent {
  sessionId: string;
  id?: string;
  name?: string;
  result?: unknown;
  timestamp?: string;
}

@Injectable()
export class ChatSessionEventsService {
  constructor(
    @Inject(forwardRef(() => ChatMessagesGateway)) private readonly messagesGateway: ChatMessagesGateway,
    @Inject(forwardRef(() => ToolsGateway)) private readonly toolsGateway?: ToolsGateway,
  ) { }

  emitPartial(message: ChatMessageDto): void {
    try {
      this.messagesGateway.emitPartial(message);
    } catch {
      // Ignore gateway errors to keep stream rendering resilient.
    }
  }

  emitToolCall(payload: ChatSessionToolCallEvent): void {
    if (!this.toolsGateway) return;
    try {
      this.toolsGateway.emitToolCall(payload);
    } catch {
      // Ignore to isolate transport concerns.
    }
  }

  emitToolResult(payload: ChatSessionToolResultEvent): void {
    if (!this.toolsGateway) return;
    try {
      this.toolsGateway.emitToolResult(payload);
    } catch {
      // Ignore to isolate transport concerns.
    }
  }
}
