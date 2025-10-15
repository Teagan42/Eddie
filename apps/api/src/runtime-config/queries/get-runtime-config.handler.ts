import { Injectable } from "@nestjs/common";
import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { RuntimeConfigDto } from "../dto/runtime-config.dto";
import { RuntimeConfigService } from "../runtime-config.service";
import { GetRuntimeConfigQuery } from "./get-runtime-config.query";

@Injectable()
@QueryHandler(GetRuntimeConfigQuery)
export class GetRuntimeConfigHandler
implements IQueryHandler<GetRuntimeConfigQuery, RuntimeConfigDto>
{
  constructor(private readonly service: RuntimeConfigService) {}

  async execute(): Promise<RuntimeConfigDto> {
    return this.service.get();
  }
}
