import { Controller, DefaultValuePipe, Get, ParseIntPipe, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { LogEntryDto } from "./dto/log-entry.dto";
import { LogsService } from "./logs.service";

@ApiTags("logs")
@Controller("logs")
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @ApiOperation({ summary: "List log entries" })
  @ApiOkResponse({ type: LogEntryDto, isArray: true })
  @Get()
  list(
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number = 0,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number = 50
  ): LogEntryDto[] {
    return this.logs.list({ offset, limit });
  }

  @ApiOperation({ summary: "Append a diagnostic log" })
  @ApiOkResponse({ type: LogEntryDto })
  @Post()
  emit(): LogEntryDto {
    return this.logs.append("info", "Manual log emission", {
      source: "api",
    });
  }
}
