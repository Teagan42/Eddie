import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { TraceCreated, TraceUpdated, type TraceDomainEvent } from "./events";
import { TracesGateway } from "./traces.gateway";

@Injectable()
@EventsHandler(TraceCreated, TraceUpdated)
export class TracesGatewayEventsHandler implements IEventHandler<
  TraceDomainEvent
> {
  constructor(
    @Inject(TracesGateway)
    private readonly gateway: TracesGateway
  ) {}

  handle(event: TraceDomainEvent): void {
    if (event instanceof TraceCreated) {
      this.gateway.emitTraceCreated(event.trace);
      return;
    }

    if (event instanceof TraceUpdated) {
      this.gateway.emitTraceUpdated(event.trace);
    }
  }
}
