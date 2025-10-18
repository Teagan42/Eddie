import { forwardRef, Inject, Injectable, Optional } from "@nestjs/common";
import { CommandBus, EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { ChatMessagesGateway } from "./chat-messages.gateway";
import type { ChatMessageDto } from "./dto/chat-session.dto";
import {
  ChatMessagePartialEvent,
  ChatSessionToolCallEvent,
  ChatSessionToolResultEvent,
} from "@eddie/types";
import { StartToolCallCommand } from "../tools/commands/start-tool-call.command";
import { CompleteToolCallCommand } from "../tools/commands/complete-tool-call.command";

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
    @Optional() private readonly commandBus?: CommandBus,
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
