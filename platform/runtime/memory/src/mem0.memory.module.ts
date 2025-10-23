import { DynamicModule, Module, type Provider } from "@nestjs/common";
import {
  Mem0Client,
  type Mem0RestCredentials,
} from "./adapters/mem0.client";
import {
  QdrantVectorStore,
  type QdrantVectorStoreDescriptor,
} from "./adapters/qdrant.vector-store";
import {
  Mem0MemoryService,
  type FacetExtractorStrategy,
  type Mem0MemoryServiceDependencies,
} from "./mem0.memory.service";

export const MEM0_CLIENT_TOKEN = Symbol("MEM0_CLIENT_TOKEN");
export const MEM0_VECTOR_STORE_TOKEN = Symbol("MEM0_VECTOR_STORE_TOKEN");
export const MEM0_FACET_EXTRACTOR_TOKEN = Symbol(
  "MEM0_FACET_EXTRACTOR_TOKEN",
);

export interface Mem0MemoryModuleOptions {
  credentials: Mem0RestCredentials;
  vectorStore?: QdrantVectorStoreDescriptor;
  facetExtractor?: FacetExtractorStrategy;
}

@Module({})
export class Mem0MemoryModule {}

export function createMem0MemoryModule(
  options: Mem0MemoryModuleOptions,
): DynamicModule {
  const clientProvider: Provider<Mem0MemoryServiceDependencies["client"]> = {
    provide: MEM0_CLIENT_TOKEN,
    useFactory: () => new Mem0Client(options.credentials),
  };

  const vectorStoreProvider: Provider<QdrantVectorStore | undefined> = {
    provide: MEM0_VECTOR_STORE_TOKEN,
    useFactory: () =>
      options.vectorStore
        ? new QdrantVectorStore(options.vectorStore)
        : undefined,
  };

  const facetExtractorProvider: Provider<FacetExtractorStrategy | undefined> = {
    provide: MEM0_FACET_EXTRACTOR_TOKEN,
    useValue: options.facetExtractor,
  };

  const serviceProvider: Provider<Mem0MemoryService> = {
    provide: Mem0MemoryService,
    useFactory: (
      client: Mem0MemoryServiceDependencies["client"],
      vectorStore: QdrantVectorStore | undefined,
      facetExtractor: FacetExtractorStrategy | undefined,
    ) =>
      new Mem0MemoryService({
        client,
        vectorStore,
        facetExtractor,
      }),
    inject: [
      MEM0_CLIENT_TOKEN,
      MEM0_VECTOR_STORE_TOKEN,
      MEM0_FACET_EXTRACTOR_TOKEN,
    ],
  };

  return {
    module: Mem0MemoryModule,
    providers: [
      clientProvider,
      vectorStoreProvider,
      facetExtractorProvider,
      serviceProvider,
    ],
    exports: [
      Mem0MemoryService,
      MEM0_CLIENT_TOKEN,
      MEM0_VECTOR_STORE_TOKEN,
      MEM0_FACET_EXTRACTOR_TOKEN,
    ],
  };
}
