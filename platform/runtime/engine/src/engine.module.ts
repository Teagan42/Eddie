import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import {
  ConfigModule,
  ConfigStore,
  MODULE_OPTIONS_TOKEN,
} from "@eddie/config";
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
import { DemoSeedReplayService } from "./demo/demo-seed-replay.service";
import { Mem0MemoryModule } from "@eddie/memory";
import type { CliRuntimeOptions, MemoryConfig } from "@eddie/types";
import type { QdrantVectorStoreDescriptor, Mem0MemoryModuleOptions } from "@eddie/memory";
import { createMem0FacetExtractor } from "./memory/mem0-facet-extractor.factory";
import { AgentMemoryCoordinator } from "./memory/agent-memory-coordinator";

@Module({
  imports: [
    ConfigModule,
    Mem0MemoryModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigStore, MODULE_OPTIONS_TOKEN],
      useFactory: async (
        configStore: ConfigStore,
        cliOptions: CliRuntimeOptions,
      ): Promise<Mem0MemoryModuleOptions> => {
        const snapshot = configStore.getSnapshot();
        const memory = snapshot.memory;
        const credentials = resolveMem0Credentials(memory, cliOptions);
        return {
          ...(credentials ? { credentials } : {}),
          vectorStore: resolveMem0VectorStore(memory),
          facetExtractor: createMem0FacetExtractor(memory?.facets),
        };
      },
    }),
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
    AgentMemoryCoordinator,
    transcriptCompactorFactoryProvider,
    TranscriptCompactionService,
    DemoSeedReplayService,
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

interface Mem0Credentials {
  apiKey: string;
  host?: string;
}

function resolveMem0Credentials(
  memory: MemoryConfig | undefined,
  cliOptions: CliRuntimeOptions,
): Mem0Credentials | undefined {
  const configCredentials = memory?.mem0 ?? {};
  const apiKey = cliOptions.mem0ApiKey ?? configCredentials.apiKey;
  const host = cliOptions.mem0Host ?? configCredentials.host;

  if (!apiKey) {
    return undefined;
  }

  return host ? { apiKey, host } : { apiKey };
}

function resolveMem0VectorStore(
  memory: MemoryConfig | undefined,
): QdrantVectorStoreDescriptor | undefined {
  const vectorStore = memory?.vectorStore;
  if (vectorStore?.provider !== "qdrant") {
    return undefined;
  }

  const qdrant = vectorStore.qdrant ?? {};
  if (!qdrant.url) {
    return undefined;
  }

  const descriptor: QdrantVectorStoreDescriptor = {
    type: "qdrant",
    url: qdrant.url,
  };

  if (qdrant.apiKey) {
    descriptor.apiKey = qdrant.apiKey;
  }

  if (qdrant.collection) {
    descriptor.collection = qdrant.collection;
  }

  if (typeof qdrant.timeoutMs === "number") {
    descriptor.timeoutMs = qdrant.timeoutMs;
  }

  return descriptor;
}
