import { Module, type Provider } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { ConfigModule } from "@eddie/config";
import { ConfigStore } from "@eddie/config";
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
import {
  TemplateRuntimeService,
  templateRuntimeProviders,
} from "./templating/template-runtime.service";
import { TranscriptCompactionService } from "./transcript/transcript-compaction.service";
import {
  TRANSCRIPT_COMPACTION_SETTINGS,
  TRANSCRIPT_COMPACTOR_FACTORY,
  extractTranscriptCompactionSettings,
} from "./transcript/transcript-compaction.tokens";
import { createTranscriptCompactor } from "./transcript-compactors";

const transcriptCompactionProviders: Provider[] = [
  {
    provide: TRANSCRIPT_COMPACTION_SETTINGS,
    useFactory: (configStore: ConfigStore) => () =>
      extractTranscriptCompactionSettings(configStore.getSnapshot()),
    inject: [ ConfigStore ],
  },
  {
    provide: TRANSCRIPT_COMPACTOR_FACTORY,
    useValue: createTranscriptCompactor,
  },
  TranscriptCompactionService,
];

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
    ...transcriptCompactionProviders,
    EngineService,
    AgentInvocationFactory,
    AgentOrchestratorService,
  ],
  exports: [
    EngineService,
    AgentOrchestratorService,
    TemplateRuntimeService,
    ConfigModule,
    HooksModule,
    ProvidersModule,
    TokenizersModule,
    ToolsModule,
    TranscriptCompactionService,
  ],
})
export class EngineModule {}
