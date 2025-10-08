import { Module } from "@nestjs/common";
import { ToolRegistryFactory } from "./tool-registry.service";

/**
 * ToolsModule centralises tool registry providers so consumers can inject
 * ToolRegistryFactory without depending on implementation details.
 */
@Module({
  providers: [ToolRegistryFactory],
  exports: [ToolRegistryFactory],
})
export class ToolsModule {}
