import { Module } from "@nestjs/common";
import { IoModule, LoggerService } from "@eddie/io";
import { McpToolSourceService } from "./mcp-tool-source.service";

const mcpToolSourceServiceProvider = {
  provide: McpToolSourceService,
  useFactory: (logger: LoggerService) => new McpToolSourceService(logger),
  inject: [LoggerService],
} as const;

@Module({
  imports: [IoModule],
  providers: [mcpToolSourceServiceProvider],
  exports: [mcpToolSourceServiceProvider],
})
export class MCPModule {}
