import {
  ConfigurableModuleBuilder,
  Module,
  type Provider,
} from "@nestjs/common";
import {
  Mem0Client,
  type Mem0RestCredentials,
} from "./adapters/mem0.client";
import {
  QdrantVectorStore,
  type QdrantVectorStoreDescriptor,
} from "./adapters/qdrant.vector-store";
import {
  MEM0_CLIENT_TOKEN,
  MEM0_FACET_EXTRACTOR_TOKEN,
  MEM0_VECTOR_STORE_TOKEN,
} from "./mem0.memory.tokens";
import {
  Mem0MemoryService,
  type FacetExtractorStrategy,
  type Mem0MemoryServiceDependencies,
} from "./mem0.memory.service";

export interface Mem0MemoryModuleOptions {
  credentials: Mem0RestCredentials;
  vectorStore?: QdrantVectorStoreDescriptor;
  facetExtractor?: FacetExtractorStrategy;
}

const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<Mem0MemoryModuleOptions>()
    .setClassMethodName("register")
    .build();

const clientProvider: Provider<Mem0MemoryServiceDependencies["client"]> = {
  provide: MEM0_CLIENT_TOKEN,
  useFactory: (options: Mem0MemoryModuleOptions) =>
    new Mem0Client(options.credentials),
  inject: [MODULE_OPTIONS_TOKEN],
};

const vectorStoreProvider: Provider<QdrantVectorStore | undefined> = {
  provide: MEM0_VECTOR_STORE_TOKEN,
  useFactory: (options: Mem0MemoryModuleOptions) =>
    options.vectorStore
      ? new QdrantVectorStore(options.vectorStore)
      : undefined,
  inject: [MODULE_OPTIONS_TOKEN],
};

const facetExtractorProvider: Provider<FacetExtractorStrategy | undefined> = {
  provide: MEM0_FACET_EXTRACTOR_TOKEN,
  useFactory: (options: Mem0MemoryModuleOptions) => options.facetExtractor,
  inject: [MODULE_OPTIONS_TOKEN],
};

@Module({
  providers: [
    clientProvider,
    vectorStoreProvider,
    facetExtractorProvider,
    Mem0MemoryService,
  ],
  exports: [
    Mem0MemoryService,
    MEM0_CLIENT_TOKEN,
    MEM0_VECTOR_STORE_TOKEN,
    MEM0_FACET_EXTRACTOR_TOKEN,
  ],
})
export class Mem0MemoryModule extends ConfigurableModuleClass {}

export { MODULE_OPTIONS_TOKEN as MEM0_MEMORY_MODULE_OPTIONS_TOKEN };
export {
  MEM0_CLIENT_TOKEN,
  MEM0_VECTOR_STORE_TOKEN,
  MEM0_FACET_EXTRACTOR_TOKEN,
} from "./mem0.memory.tokens";
