import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { ExecutionTreeStateUpdatedEvent } from "@eddie/types";
import { ExecutionTreeStateStore } from "./execution-tree-state.store";

@EventsHandler(ExecutionTreeStateUpdatedEvent)
export class ExecutionTreeStateUpdatedEventsHandler implements IEventHandler<ExecutionTreeStateUpdatedEvent> {
  constructor(private readonly store: ExecutionTreeStateStore) {}

  async handle(event: ExecutionTreeStateUpdatedEvent): Promise<void> {
    this.store.set(event.sessionId, event.state);
  }
}
