import { forwardRef, Inject, Injectable, Optional } from "@nestjs/common";
import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { ChatMessagesGateway } from "./chat-messages.gateway";
import type { ChatMessageDto } from "./dto/chat-session.dto";
import {
  ChatMessagePartialEvent,
  ChatMessageReasoningCompleteEvent,
  ChatMessageReasoningDeltaEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
} from "@eddie/types";
import { StartToolCallCommand } from "../tools/commands/start-tool-call.command";
import { CompleteToolCallCommand } from "../tools/commands/complete-tool-call.command";

@Injectable()
@EventsHandler(
  ChatMessagePartialEvent,
  ChatMessageReasoningDeltaEvent,
  ChatMessageReasoningCompleteEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
)
export class ChatSessionEventsService
implements
    IEventHandler<
      | ChatMessagePartialEvent
      | ChatMessageReasoningDeltaEvent
      | ChatMessageReasoningCompleteEvent
      | ChatSessionToolCallEvent
      | ChatSessionToolResultEvent
    > {
  constructor(
    @Inject(forwardRef(() => ChatMessagesGateway)) private readonly messagesGateway: ChatMessagesGateway,
    @Optional() private readonly commandBus?: CommandBus,
  ) { }

  handle(
    event:
      | ChatMessagePartialEvent
      | ChatMessageReasoningDeltaEvent
      | ChatMessageReasoningCompleteEvent
      | ChatSessionToolCallEvent
      | ChatSessionToolResultEvent
  ): void {
    if (event instanceof ChatMessagePartialEvent) {
      this.emitPartial(event.message as ChatMessageDto);
      return;
    }

    if (event instanceof ChatMessageReasoningDeltaEvent) {
      this.emitReasoningPartial({
        sessionId: event.sessionId,
        messageId: event.messageId,
        text: event.text,
        metadata: event.metadata,
        timestamp: event.timestamp,
        agentId: event.agentId ?? null,
      });
      return;
    }

    if (event instanceof ChatMessageReasoningCompleteEvent) {
      this.emitReasoningComplete({
        sessionId: event.sessionId,
        messageId: event.messageId,
        responseId: event.responseId,
        text: event.text,
        metadata: event.metadata,
        timestamp: event.timestamp,
        agentId: event.agentId ?? null,
      });
      return;
    }

    if (event instanceof ChatSessionToolCallEvent) {
      this.dispatchCommand(
        new StartToolCallCommand({
          sessionId: event.sessionId,
          toolCallId: event.id,
          name: event.name,
          arguments: event.arguments,
          timestamp: event.timestamp,
          agentId: event.agentId ?? null,
        })
      );
      return;
    }

    if (event instanceof ChatSessionToolResultEvent) {
      this.dispatchCommand(
        new CompleteToolCallCommand({
          sessionId: event.sessionId,
          toolCallId: event.id,
          name: event.name,
          result: event.result,
          timestamp: event.timestamp,
          agentId: event.agentId ?? null,
        })
      );
    }
  }

  private emitPartial(message: ChatMessageDto): void {
    try {
      this.messagesGateway.emitPartial(message);
    } catch {
      // Ignore gateway errors to keep stream rendering resilient.
    }
  }

  private emitReasoningPartial(payload: {
    sessionId: string;
    messageId: string;
    text: string;
    metadata: Record<string, unknown> | undefined;
    timestamp: string | undefined;
    agentId: string | null;
  }): void {
    try {
      this.messagesGateway.emitReasoningPartial(payload);
    } catch {
      // Ignore gateway errors to keep stream rendering resilient.
    }
  }

  private emitReasoningComplete(payload: {
    sessionId: string;
    messageId: string;
    responseId: string | undefined;
    text: string | undefined;
    metadata: Record<string, unknown> | undefined;
    timestamp: string | undefined;
    agentId: string | null;
  }): void {
    try {
      this.messagesGateway.emitReasoningComplete(payload);
    } catch {
      // Ignore gateway errors to keep event pipeline resilient.
    }
  }

  private dispatchCommand(command: StartToolCallCommand | CompleteToolCallCommand): void {
    if (!this.commandBus) return;
    try {
      const result = this.commandBus.execute(command);
      this.ignoreRejection(result);
    } catch {
      // Ignore command bus failures to keep event pipeline resilient.
    }
  }

  private ignoreRejection(result: unknown): void {
    void Promise.resolve(result).catch(() => {
      // Ignore command bus failures to keep event pipeline resilient.
    });
  }
}
