import type { TraceDto } from "../dto/trace.dto";
import type { TraceStatus } from "./create-trace.command";

export interface UpdateTraceInput {
  status: TraceStatus;
  durationMs?: number;
  metadata?: TraceDto["metadata"];
}

export class UpdateTraceCommand {
  constructor(
    public readonly id: string,
    public readonly input: UpdateTraceInput
  ) {}
}
