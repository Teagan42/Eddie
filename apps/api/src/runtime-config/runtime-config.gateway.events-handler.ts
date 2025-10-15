import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { RuntimeConfigGateway } from "./runtime-config.gateway";
import { RuntimeConfigUpdated } from "./events/runtime-config-updated.event";

@Injectable()
@EventsHandler(RuntimeConfigUpdated)
export class RuntimeConfigGatewayEventsHandler
implements IEventHandler<RuntimeConfigUpdated>
{
  constructor(
    @Inject(RuntimeConfigGateway)
    private readonly gateway: RuntimeConfigGateway
  ) {}

  handle(event: RuntimeConfigUpdated): void {
    this.gateway.emitConfigUpdated(event.config);
  }
}
