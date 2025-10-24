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
import {
  Mem0MemoryService,
  type FacetExtractorStrategy,
  type Mem0MemoryServiceDependencies,
} from "./mem0.memory.service";

type Mem0ClientContract = Mem0MemoryServiceDependencies["client"];

const mem0ClientProvider: Provider<Mem0ClientContract> = {
  provide: MEM0_CLIENT_TOKEN,
  useFactory: (options: Mem0MemoryModuleOptions) =>
    createMem0Client(options),
  inject: [MEM0_MEMORY_MODULE_OPTIONS_TOKEN],
};

const mem0ClientClassProvider: Provider = {
  provide: Mem0Client,
  useExisting: MEM0_CLIENT_TOKEN,
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
    mem0ClientProvider,
    mem0ClientClassProvider,
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

function createMem0Client(
  options: Mem0MemoryModuleOptions,
): Mem0ClientContract {
  const credentials = options.credentials;

  if (!credentials?.apiKey) {
    return createDisabledMem0Client();
  }

  return new Mem0Client(options);
}

function createDisabledMem0Client(): Mem0ClientContract {
  return {
    searchMemories: () => Promise.reject(createMem0CredentialsError()),
    createMemories: () => Promise.reject(createMem0CredentialsError()),
  } satisfies Mem0ClientContract;
}

function createMem0CredentialsError(): Error {
  return new Error("Mem0 API key is required");
}
