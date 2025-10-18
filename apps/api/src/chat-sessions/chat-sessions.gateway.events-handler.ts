import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import {
  AgentActivity,
  ChatMessageSent,
  ChatSessionCreated,
  ChatSessionDeleted,
  ChatSessionUpdated,
  type ChatSessionsDomainEvent,
} from "./events";
import { ChatSessionsGateway } from "./chat-sessions.gateway";
import {
  ExecutionTreeStateUpdatedEvent,
  type ExecutionTreeState,
} from "@eddie/types";

@Injectable()
@EventsHandler(
  ChatSessionCreated,
  ChatSessionUpdated,
  ChatSessionDeleted,
  ChatMessageSent,
  AgentActivity,
  ExecutionTreeStateUpdatedEvent,
)
export class ChatSessionsGatewayEventsHandler
implements
    IEventHandler<ChatSessionsDomainEvent | ExecutionTreeStateUpdatedEvent>
{
  constructor(
    @Inject(ChatSessionsGateway)
    private readonly gateway: ChatSessionsGateway
  ) {}

  handle(
    event: ChatSessionsDomainEvent | ExecutionTreeStateUpdatedEvent
  ): void {
    if (event instanceof ChatSessionCreated) {
      this.gateway.emitSessionCreated(event.session);
      return;
    }

    if (event instanceof ChatSessionUpdated) {
      this.gateway.emitSessionUpdated(event.session);
      return;
    }

    if (event instanceof ChatSessionDeleted) {
      this.gateway.emitSessionDeleted(event.sessionId);
      return;
    }

    if (event instanceof ChatMessageSent) {
      if (event.mode === "created") {
        this.gateway.emitMessageCreated(event.message);
      } else {
        this.gateway.emitMessageUpdated(event.message);
      }
      return;
    }

    if (event instanceof AgentActivity) {
      this.gateway.emitAgentActivity({
        sessionId: event.sessionId,
        state: event.state,
        timestamp: event.timestamp,
      });
      return;
    }

    if (this.isExecutionTreeUpdateEvent(event)) {
      this.gateway.emitExecutionTreeUpdated({
        sessionId: event.sessionId,
        state: event.state,
      });
      return;
    }
  }

  private isExecutionTreeUpdateEvent(
    event: ChatSessionsDomainEvent | ExecutionTreeStateUpdatedEvent
  ): event is ExecutionTreeUpdateEventLike {
    if (event instanceof ExecutionTreeStateUpdatedEvent) {
      return true;
    }

    if (typeof event !== "object" || event === null) {
      return false;
    }

    return (
      "sessionId" in event &&
      typeof (event as ExecutionTreeUpdateEventLike).sessionId === "string" &&
      "state" in event
    );
  }
}

type ExecutionTreeUpdateEventLike = {
  sessionId: string;
  state: ExecutionTreeState;
};
