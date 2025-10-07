import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { ContextModule } from "../context/context.module";
import { IoModule } from "../../io";
import { HooksModule } from "../../hooks";
import { ProvidersModule } from "../providers/providers.module";
import { TokenizersModule } from "../tokenizers";
import { EngineService } from "./engine.service";
import { ToolsModule } from "../tools";
import { AgentInvocationFactory, AgentOrchestratorService } from "../agents";
import { McpToolSourceService } from "../../integrations";

@Module({
  imports: [
    ConfigModule,
    ContextModule,
    IoModule,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
    ToolsModule,
  ],
  providers: [
    EngineService,
    AgentInvocationFactory,
    AgentOrchestratorService,
    McpToolSourceService,
  ],
  exports: [
    EngineService,
    AgentOrchestratorService,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
    ToolsModule,
  ],
})
export class EngineModule {}
