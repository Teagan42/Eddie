import type { IEvent } from "@nestjs/cqrs";
import type { LogEntryDto } from "../dto/log-entry.dto";

export class LogCreatedEvent implements IEvent {
  constructor(public readonly entry: LogEntryDto) {}
}
