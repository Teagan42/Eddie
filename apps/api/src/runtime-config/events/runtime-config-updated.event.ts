import type { IEvent } from "@nestjs/cqrs";
import type { RuntimeConfigDto } from "../dto/runtime-config.dto";

export class RuntimeConfigUpdated implements IEvent {
  constructor(public readonly config: RuntimeConfigDto) {}
}

export { RuntimeConfigUpdated as RuntimeConfigUpdatedEvent };
