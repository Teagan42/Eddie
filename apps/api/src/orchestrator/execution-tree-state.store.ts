import { Injectable } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import {
  ExecutionTreeStateUpdatedEvent,
  type ExecutionTreeState,
} from "@eddie/types";

@Injectable()
@EventsHandler(ExecutionTreeStateUpdatedEvent)
export class ExecutionTreeStateStore implements IEventHandler<ExecutionTreeStateUpdatedEvent> {
  private readonly statesBySession = new Map<string, ExecutionTreeState>();

  handle(event: ExecutionTreeStateUpdatedEvent): void {
    this.statesBySession.set(event.sessionId, event.state);
  }

  get(sessionId: string): ExecutionTreeState | undefined {
    return this.statesBySession.get(sessionId);
  }

  clear(sessionId?: string): void {
    if (sessionId) {
      this.statesBySession.delete(sessionId);
      return;
    }

    this.statesBySession.clear();
  }
}
