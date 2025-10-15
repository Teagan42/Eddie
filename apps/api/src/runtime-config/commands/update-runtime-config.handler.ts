import { Injectable } from "@nestjs/common";
import { CommandHandler, EventBus, type ICommandHandler } from "@nestjs/cqrs";
import type { RuntimeConfigDto } from "../dto/runtime-config.dto";
import { RuntimeConfigService } from "../runtime-config.service";
import { RuntimeConfigUpdated } from "../events/runtime-config-updated.event";
import { UpdateRuntimeConfigCommand } from "./update-runtime-config.command";

@Injectable()
@CommandHandler(UpdateRuntimeConfigCommand)
export class UpdateRuntimeConfigHandler
implements ICommandHandler<UpdateRuntimeConfigCommand, RuntimeConfigDto>
{
  constructor(
    private readonly service: RuntimeConfigService,
    private readonly eventBus: EventBus
  ) {}

  async execute({ partial }: UpdateRuntimeConfigCommand): Promise<RuntimeConfigDto> {
    const config = this.service.update(partial);
    this.eventBus.publish(new RuntimeConfigUpdated(config));
    return config;
  }
}
