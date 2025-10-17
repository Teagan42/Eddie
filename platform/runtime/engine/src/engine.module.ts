import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ConfigModule } from "@eddie/config";
import { ContextModule } from "@eddie/context";
import { IoModule } from "@eddie/io";
import { HooksModule } from "@eddie/hooks";
import { ProvidersModule } from "@eddie/providers";
import { TokenizersModule } from "@eddie/tokenizers";
import {
  TemplateModule,
  TemplateRuntimeService,
  templateRuntimeProviders,
} from "@eddie/templates";
import { EngineService } from "./engine.service";
import { ToolsModule } from "@eddie/tools";
import { AgentInvocationFactory } from "./agents/agent-invocation.factory";
import { AgentOrchestratorService } from "./agents/agent-orchestrator.service";
import { MCPModule } from "@eddie/mcp";
import { TranscriptCompactionService } from "./transcript/transcript-compaction.service";
import { transcriptCompactorFactoryProvider } from "./transcript/transcript-compactor.factory";
import { metricsProviders, MetricsService } from "./telemetry/metrics.service";

@Module({
  imports: [
    ConfigModule,
    ContextModule,
    IoModule,
    CqrsModule,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
    TemplateModule,
    ToolsModule,
    MCPModule,
  ],
  providers: [
    ...templateRuntimeProviders,
    ...metricsProviders,
    EngineService,
    AgentInvocationFactory,
    AgentOrchestratorService,
    transcriptCompactorFactoryProvider,
    TranscriptCompactionService,
  ],
  exports: [
    EngineService,
    AgentOrchestratorService,
    TemplateRuntimeService,
    TranscriptCompactionService,
    MetricsService,
    ConfigModule,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
    ToolsModule,
    transcriptCompactorFactoryProvider,
  ],
})
export class EngineModule {}
