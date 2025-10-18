import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { EventBus, type IEventHandler } from "@nestjs/cqrs";
import {
  ExecutionTreeStateUpdatedEvent,
  type ExecutionTreeState,
} from "@eddie/types";
import type { Subscription } from "rxjs";

@Injectable()
export class ExecutionTreeStateStore implements
  IEventHandler<ExecutionTreeStateUpdatedEvent>,
  OnModuleInit,
  OnModuleDestroy
{
  private readonly statesBySession = new Map<string, ExecutionTreeState>();
  private subscription?: Subscription;

  constructor(
    @Optional()
    @Inject(EventBus)
    private readonly eventBus?: EventBus
  ) {}

  onModuleInit(): void {
    if (!this.eventBus) {
      return;
    }

    this.subscription = this.eventBus.subscribe((event) => {
      if (this.isExecutionTreeStateUpdatedEvent(event)) {
        this.handle(event);
      }
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

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

  private isExecutionTreeStateUpdatedEvent(
    event: unknown
  ): event is ExecutionTreeStateUpdatedEvent {
    return event instanceof ExecutionTreeStateUpdatedEvent;
  }
}
