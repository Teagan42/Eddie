import { Module } from "@nestjs/common";
import { McpToolSourceService } from "./mcp-tool-source.service";

@Module({
  providers: [McpToolSourceService],
  exports: [McpToolSourceService],
})
export class MCPModule {}
