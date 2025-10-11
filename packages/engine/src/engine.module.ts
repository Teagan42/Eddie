import { Module } from "@nestjs/common";
import { ConfigModule, ConfigStore } from "@eddie/config";
import { ContextModule } from "@eddie/context";
import { IoModule } from "@eddie/io";
import { HooksModule } from "@eddie/hooks";
import { ProvidersModule } from "@eddie/providers";
import { TokenizersModule } from "@eddie/tokenizers";
import { TemplateModule } from "@eddie/templates";
import { EngineService } from "./engine.service";
import { ToolsModule } from "@eddie/tools";
import { AgentInvocationFactory } from "./agents/agent-invocation.factory";
import { AgentOrchestratorService } from "./agents/agent-orchestrator.service";
import { MCPModule } from "@eddie/mcp";

@Module({
  imports: [
    ConfigModule,
    ContextModule,
    IoModule,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
    TemplateModule,
    ToolsModule,
    MCPModule,
  ],
  providers: [
    EngineService,
    AgentInvocationFactory,
    AgentOrchestratorService,
  ],
  exports: [
    EngineService,
    AgentOrchestratorService,
    ConfigStore,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
    ToolsModule,
  ],
})
export class EngineModule {}
