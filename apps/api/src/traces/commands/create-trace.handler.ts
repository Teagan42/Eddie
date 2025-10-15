import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { EventBus } from "@nestjs/cqrs";
import type { TraceDto } from "../dto/trace.dto";
import { TracesService } from "../traces.service";
import { CreateTraceCommand } from "./create-trace.command";
import { TraceCreated } from "../events";

@CommandHandler(CreateTraceCommand)
export class CreateTraceHandler implements ICommandHandler<
  CreateTraceCommand,
  TraceDto
> {
  constructor(
    private readonly tracesService: TracesService,
    private readonly eventBus: EventBus
  ) {}

  async execute({ input }: CreateTraceCommand): Promise<TraceDto> {
    const trace = this.tracesService.create(input);
    this.eventBus.publish(new TraceCreated(trace));
    return trace;
  }
}
