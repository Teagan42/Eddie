import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TraceDto } from "./dto/trace.dto";
import { TracesService } from "./traces.service";

@ApiTags("traces")
@Controller("traces")
export class TracesController {
  constructor(private readonly traces: TracesService) {}

  @ApiOperation({ summary: "List traces" })
  @ApiOkResponse({ type: TraceDto, isArray: true })
  @Get()
  list(): TraceDto[] {
    return this.traces.list();
  }

  @ApiOperation({ summary: "Get a trace" })
  @ApiOkResponse({ type: TraceDto })
  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string): TraceDto {
    return this.traces.get(id);
  }
}
