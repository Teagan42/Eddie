import { Body, Controller, Get, Patch } from "@nestjs/common";
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";
import { UpdateRuntimeConfigDto } from "./dto/update-runtime-config.dto";
import { RuntimeConfigService } from "./runtime-config.service";

@ApiTags("config")
@Controller("config")
export class RuntimeConfigController {
  constructor(private readonly config: RuntimeConfigService) {}

  @ApiOperation({ summary: "Get runtime configuration" })
  @ApiOkResponse({ type: RuntimeConfigDto })
  @Get()
  get(): RuntimeConfigDto {
    return this.config.get();
  }

  @ApiOperation({ summary: "Update runtime configuration" })
  @ApiOkResponse({ type: RuntimeConfigDto })
  @Patch()
  @ApiBody({ type: UpdateRuntimeConfigDto })
  update(@Body() dto: UpdateRuntimeConfigDto): RuntimeConfigDto {
    return this.config.update(dto);
  }
}
