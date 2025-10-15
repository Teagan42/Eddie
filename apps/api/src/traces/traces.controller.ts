import { QueryBus } from "@nestjs/cqrs";
import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TraceDto } from "./dto/trace.dto";
import { GetTraceQuery, GetTracesQuery } from "./queries";

@ApiTags("traces")
@Controller("traces")
export class TracesController {
  constructor(
    private readonly queryBus: QueryBus
  ) {}

  @ApiOperation({ summary: "List traces" })
  @ApiOkResponse({ type: TraceDto, isArray: true })
  @Get()
  async list(): Promise<TraceDto[]> {
    return this.queryBus.execute(new GetTracesQuery());
  }

  @ApiOperation({ summary: "Get a trace" })
  @ApiOkResponse({ type: TraceDto })
  @Get(":id")
  async get(@Param("id", ParseUUIDPipe) id: string): Promise<TraceDto> {
    return this.queryBus.execute(new GetTraceQuery(id));
  }
}
