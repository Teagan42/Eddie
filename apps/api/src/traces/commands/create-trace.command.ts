import { ICommand } from '@nestjs/cqrs';
import type { TraceDto } from "../dto/trace.dto";

export type TraceStatus = TraceDto["status"];

export interface CreateTraceInput {
  sessionId?: string;
  name?: string;
  status?: TraceStatus;
  durationMs?: number;
  metadata?: TraceDto["metadata"];
}

export class CreateTraceCommand implements ICommand {
  constructor(public readonly input: CreateTraceInput) {}
}
