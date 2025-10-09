import { Controller, Get, Post } from "@nestjs/common";
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
  list(): LogEntryDto[] {
    return this.logs.list();
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
