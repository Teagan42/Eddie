import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EventBus } from "@nestjs/cqrs";
import type { TraceDto } from "../dto/trace.dto";
import { TracesService } from "../traces.service";
import { TraceUpdated } from "../events";
import { UpdateTraceCommand } from "./update-trace.command";

@CommandHandler(UpdateTraceCommand)
export class UpdateTraceHandler implements ICommandHandler<
  UpdateTraceCommand,
  TraceDto
> {
  constructor(
    private readonly tracesService: TracesService,
    private readonly eventBus: EventBus
  ) {}

  async execute({ id, input }: UpdateTraceCommand): Promise<TraceDto> {
    const { status, durationMs, metadata } = input;
    const trace = this.tracesService.updateStatus(
      id,
      status,
      durationMs,
      metadata
    );
    this.eventBus.publish(new TraceUpdated(trace));
    return trace;
  }
}
