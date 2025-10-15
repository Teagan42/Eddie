import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { LogsGateway } from "./logs.gateway";
import { LogCreatedEvent } from "./events/log-created.event";

@Injectable()
@EventsHandler(LogCreatedEvent)
export class LogsGatewayEventsHandler implements IEventHandler<LogCreatedEvent> {
  constructor(@Inject(LogsGateway) private readonly gateway: LogsGateway) {}

  handle(event: LogCreatedEvent): void {
    this.gateway.onLogCreated(event.entry);
  }
}
