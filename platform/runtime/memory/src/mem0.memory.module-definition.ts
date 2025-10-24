import { ConfigurableModuleBuilder } from "@nestjs/common";
import type { Mem0RestCredentials } from "./adapters/mem0.client";
import type { QdrantVectorStoreDescriptor } from "./adapters/qdrant.vector-store";
import type { FacetExtractorStrategy } from "./mem0.memory.service";

export interface Mem0MemoryModuleOptions {
  credentials?: Mem0RestCredentials;
  vectorStore?: QdrantVectorStoreDescriptor;
  facetExtractor?: FacetExtractorStrategy;
}

export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN: MEM0_MEMORY_MODULE_OPTIONS_TOKEN,
} = new ConfigurableModuleBuilder<Mem0MemoryModuleOptions>()
  .setClassMethodName("register")
  .build();
