import { Module, type Provider } from "@nestjs/common";
import { Mem0Client } from "./adapters/mem0.client";
import { QdrantVectorStore } from "./adapters/qdrant.vector-store";
import {
  ConfigurableModuleClass,
  MEM0_MEMORY_MODULE_OPTIONS_TOKEN,
  type Mem0MemoryModuleOptions,
} from "./mem0.memory.module-definition";
import {
  MEM0_CLIENT_TOKEN,
  MEM0_FACET_EXTRACTOR_TOKEN,
  MEM0_VECTOR_STORE_TOKEN,
} from "./mem0.memory.tokens";
import { Mem0MemoryService, type FacetExtractorStrategy } from "./mem0.memory.service";

const clientTokenProvider: Provider = {
  provide: MEM0_CLIENT_TOKEN,
  useExisting: Mem0Client,
};

const vectorStoreProvider: Provider<QdrantVectorStore | undefined> = {
  provide: MEM0_VECTOR_STORE_TOKEN,
  useFactory: (options: Mem0MemoryModuleOptions) =>
    options.vectorStore ? new QdrantVectorStore(options.vectorStore) : undefined,
  inject: [MEM0_MEMORY_MODULE_OPTIONS_TOKEN],
};

const facetExtractorProvider: Provider<FacetExtractorStrategy | undefined> = {
  provide: MEM0_FACET_EXTRACTOR_TOKEN,
  useFactory: (options: Mem0MemoryModuleOptions) => options.facetExtractor,
  inject: [MEM0_MEMORY_MODULE_OPTIONS_TOKEN],
};

@Module({
  providers: [
    Mem0Client,
    clientTokenProvider,
    vectorStoreProvider,
    facetExtractorProvider,
    Mem0MemoryService,
  ],
  exports: [
    Mem0Client,
    Mem0MemoryService,
    MEM0_CLIENT_TOKEN,
    MEM0_VECTOR_STORE_TOKEN,
    MEM0_FACET_EXTRACTOR_TOKEN,
  ],
})
export class Mem0MemoryModule extends ConfigurableModuleClass {}

export { MEM0_MEMORY_MODULE_OPTIONS_TOKEN } from "./mem0.memory.module-definition";
export type { Mem0MemoryModuleOptions } from "./mem0.memory.module-definition";
export {
  MEM0_CLIENT_TOKEN,
  MEM0_VECTOR_STORE_TOKEN,
  MEM0_FACET_EXTRACTOR_TOKEN,
} from "./mem0.memory.tokens";
