import type { FactoryProvider } from "@nestjs/common";
import { Module } from "@nestjs/common";
import { IoModule, LoggerService } from "@eddie/io";
import { McpToolSourceService } from "./mcp-tool-source.service";

export const mcpToolSourceServiceProvider: FactoryProvider<McpToolSourceService> = {
  provide: McpToolSourceService,
  useFactory: (logger: LoggerService) => new McpToolSourceService(logger),
  inject: [LoggerService],
};

@Module({
  imports: [IoModule],
  providers: [mcpToolSourceServiceProvider],
  exports: [mcpToolSourceServiceProvider],
})
export class MCPModule {}
