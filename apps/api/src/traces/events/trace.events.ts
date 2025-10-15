import type { IEvent } from "@nestjs/cqrs";
import type { TraceDto } from "../dto/trace.dto";

export class TraceCreated implements IEvent {
  constructor(public readonly trace: TraceDto) {}
}

export class TraceUpdated implements IEvent {
  constructor(public readonly trace: TraceDto) {}
}

export type TraceDomainEvent = TraceCreated | TraceUpdated;
