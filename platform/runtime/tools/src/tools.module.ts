import { Module } from "@nestjs/common";
import { ToolRegistryFactory } from "./tool-registry.service";
import { TypescriptToolSourceService } from "./typescript-tool-source.service";

/**
 * ToolsModule centralises tool registry providers so consumers can inject
 * ToolRegistryFactory without depending on implementation details.
 */
@Module({
  providers: [ToolRegistryFactory, TypescriptToolSourceService],
  exports: [ToolRegistryFactory, TypescriptToolSourceService],
})
export class ToolsModule {}
