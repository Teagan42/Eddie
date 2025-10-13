import { Module } from "@nestjs/common";
import { IoModule } from "@eddie/io";
import { McpToolSourceService } from "./mcp-tool-source.service";

@Module({
  imports: [IoModule],
  providers: [McpToolSourceService],
  exports: [McpToolSourceService],
})
export class MCPModule {}
