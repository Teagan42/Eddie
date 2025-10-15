import { Body, Controller, Get, Patch } from "@nestjs/common";
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";
import { UpdateRuntimeConfigDto } from "./dto/update-runtime-config.dto";
import { GetRuntimeConfigQuery } from "./queries/get-runtime-config.query";
import { UpdateRuntimeConfigCommand } from "./commands/update-runtime-config.command";

@ApiTags("config")
@Controller("config")
export class RuntimeConfigController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus
  ) {}

  @ApiOperation({ summary: "Get runtime configuration" })
  @ApiOkResponse({ type: RuntimeConfigDto })
  @Get()
  async get(): Promise<RuntimeConfigDto> {
    return this.queryBus.execute(new GetRuntimeConfigQuery());
  }

  @ApiOperation({ summary: "Update runtime configuration" })
  @ApiOkResponse({ type: RuntimeConfigDto })
  @Patch()
  @ApiBody({ type: UpdateRuntimeConfigDto })
  async update(
    @Body() dto: UpdateRuntimeConfigDto
  ): Promise<RuntimeConfigDto> {
    return this.commandBus.execute(new UpdateRuntimeConfigCommand(dto));
  }
}
