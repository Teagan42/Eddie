import { Module } from "@nestjs/common";
import { ConfigModule } from "../../config/config.module";
import { ContextModule } from "../context/context.module";
import { IoModule } from "../../io/io.module";
import { HooksModule } from "../../hooks/hooks.module";
import { ProvidersModule } from "../providers/providers.module";
import { TokenizersModule } from "../tokenizers/tokenizers.module";
import { TemplateModule } from "../templates/template.module";
import { EngineService } from "./engine.service";
import { ToolsModule } from "../tools/tools.module";
import { AgentInvocationFactory } from "../agents/agent-invocation.factory";
import { AgentOrchestratorService } from "../agents/agent-orchestrator.service";
import { MCPModule } from "../../integrations/mcp/mcp.module";

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
    HooksModule,
    ProvidersModule,
    TokenizersModule,
    ToolsModule,
  ],
})
export class EngineModule {}
