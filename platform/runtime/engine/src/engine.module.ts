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
import { ExecutionTreeModule } from "./execution-tree/execution-tree.module";
import { MetricsModule } from "./telemetry/metrics.module";
import {
  AgentRunLoop,
  ToolCallHandler,
  TraceWriterDelegate,
} from "./agents/runner";

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
    MetricsModule,
    ExecutionTreeModule,
  ],
  providers: [
    ...templateRuntimeProviders,
    EngineService,
    AgentInvocationFactory,
    AgentOrchestratorService,
    AgentRunLoop,
    ToolCallHandler,
    TraceWriterDelegate,
    transcriptCompactorFactoryProvider,
    TranscriptCompactionService,
  ],
  exports: [
    EngineService,
    AgentOrchestratorService,
    TemplateRuntimeService,
    TranscriptCompactionService,
    ConfigModule,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
    ToolsModule,
    transcriptCompactorFactoryProvider,
    ExecutionTreeModule,
  ],
})
export class EngineModule {}
