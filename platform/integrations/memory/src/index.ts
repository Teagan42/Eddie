import type { MemoryConfig } from "@eddie/types";
import { type DynamicModule, type Provider } from "@nestjs/common";
import { MemoryClient, type Memory, type Message } from "mem0ai";

export interface FacetExtractionContext {
  agentId?: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryStoreItem {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryStoreRequest {
  agentId?: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  strategy?: string;
  batchSize?: number;
  memories: MemoryStoreItem[];
}

export interface MemoryRecallRequest {
  query: string;
  topK?: number;
  agentId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface FacetExtractionResult {
  facets?: Record<string, unknown>;
}

export interface FacetExtractionStrategy {
  readonly name: string;
  extract(item: MemoryStoreItem, context: FacetExtractionContext): FacetExtractionResult | undefined;
}

export type FacetExtractionStrategyFactory = () => FacetExtractionStrategy;

export interface FacetRegistryOptions {
  strategies?: Record<string, FacetExtractionStrategyFactory>;
}

export class FacetRegistry {
  private readonly factories = new Map<string, FacetExtractionStrategyFactory>();
  private readonly instances = new Map<string, FacetExtractionStrategy>();

  constructor(private readonly defaultStrategy?: string, options: FacetRegistryOptions = {}) {
    Object.entries(options.strategies ?? {}).forEach(([name, factory]) => {
      this.factories.set(name, factory);
    });
  }

  resolve(requestedStrategy?: string): FacetExtractionStrategy | undefined {
    const key = requestedStrategy ?? this.defaultStrategy;
    if (!key) {
      return undefined;
    }

    if (!this.factories.has(key)) {
      return undefined;
    }

    if (!this.instances.has(key)) {
      this.instances.set(key, this.factories.get(key)!());
    }

    return this.instances.get(key);
  }
}

export interface QdrantVectorStoreConfig {
  url?: string;
  apiKey?: string;
  collection?: string;
  timeoutMs?: number;
}

export interface MemoryVectorStoreDescription {
  provider: string;
  mode: "http" | "grpc";
  collection: string;
  url?: string;
  apiKey?: string;
  timeoutMs?: number;
  host?: string;
  port?: number;
}

export interface MemoryVectorStoreAdapter {
  describe(): MemoryVectorStoreDescription;
}

class QdrantVectorStoreAdapter implements MemoryVectorStoreAdapter {
  constructor(private readonly description: MemoryVectorStoreDescription) {}

  describe(): MemoryVectorStoreDescription {
    return { ...this.description };
  }
}

export interface MemoryModuleOptions {
  config: MemoryConfig;
  mem0?: {
    apiKey?: string;
    host?: string;
    projectId?: string | number;
    projectName?: string;
    organizationId?: string | number;
    organizationName?: string;
  };
  facets?: FacetRegistryOptions;
}

export const MEM0_CLIENT = Symbol("MEM0_CLIENT");
export const MEMORY_VECTOR_STORE = Symbol("MEMORY_VECTOR_STORE");
export const MEMORY_FACET_REGISTRY = Symbol("MEMORY_FACET_REGISTRY");

interface MemoryFacadeDependencies {
  enabled: boolean;
  client?: MemoryClient;
  vectorAdapter?: MemoryVectorStoreAdapter;
  facetRegistry: FacetRegistry;
  defaultStrategy?: string;
}

export class MemoryFacade {
  constructor(private readonly deps: MemoryFacadeDependencies) {}

  async recallMemories(request: MemoryRecallRequest): Promise<Memory[]> {
    if (!this.deps.enabled || !this.deps.client) {
      return [];
    }

    const options: Record<string, unknown> = {};
    if (typeof request.topK === "number") {
      options.top_k = request.topK;
    }

    const filters: Record<string, unknown> = {};
    if (request.agentId) {
      filters.agentId = request.agentId;
    }
    if (request.sessionId) {
      filters.sessionId = request.sessionId;
    }
    if (request.metadata) {
      Object.assign(filters, request.metadata);
    }

    if (Object.keys(filters).length > 0) {
      options.filters = filters;
    }

    return this.deps.client.search(request.query, options);
  }

  async storeMemories(request: MemoryStoreRequest): Promise<void> {
    if (!this.deps.enabled || !this.deps.client) {
      return;
    }

    if (!request.memories?.length) {
      return;
    }

    const context: FacetExtractionContext = {
      agentId: request.agentId,
      sessionId: request.sessionId,
      userId: request.userId,
      metadata: request.metadata,
    };

    const strategy = this.deps.facetRegistry.resolve(request.strategy);
    const facets = strategy
      ? this.collectFacets(strategy, request.memories, context)
      : undefined;

    const baseMetadata = this.buildMetadata(
      request,
      this.deps.vectorAdapter?.describe(),
      facets,
    );

    const chunkSize = Math.max(1, request.batchSize ?? 1);
    for (const chunk of chunkArray(request.memories, chunkSize)) {
      const messages: Message[] = chunk.map((item) => ({
        role: item.role,
        content: item.content,
      }));
      await this.deps.client.add(messages, { metadata: baseMetadata });
    }
  }

  private buildMetadata(
    request: MemoryStoreRequest,
    vectorDescription?: MemoryVectorStoreDescription,
    facets?: Record<string, unknown>,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      ...(request.metadata ?? {}),
    };

    if (request.agentId) {
      metadata.agentId = request.agentId;
    }
    if (request.sessionId) {
      metadata.sessionId = request.sessionId;
    }
    if (request.userId) {
      metadata.userId = request.userId;
    }
    if (vectorDescription) {
      metadata.vectorStore = vectorDescription;
    }
    if (facets && Object.keys(facets).length > 0) {
      metadata.facets = facets;
    }

    return metadata;
  }

  private collectFacets(
    strategy: FacetExtractionStrategy,
    memories: MemoryStoreItem[],
    context: FacetExtractionContext,
  ): Record<string, unknown> | undefined {
    const collected = memories.reduce<Record<string, unknown>>((acc, item) => {
      const result = strategy.extract(item, context);
      if (result?.facets) {
        Object.assign(acc, result.facets);
      }
      return acc;
    }, {});

    return Object.keys(collected).length > 0 ? collected : undefined;
  }
}

export function createQdrantVectorStoreAdapter(
  config: QdrantVectorStoreConfig,
): MemoryVectorStoreAdapter {
  if (!config.collection) {
    throw new Error("Qdrant vector store requires a collection name");
  }

  const description: MemoryVectorStoreDescription = {
    provider: "qdrant",
    mode: "http",
    collection: config.collection,
  };

  if (config.apiKey) {
    description.apiKey = config.apiKey;
  }
  if (typeof config.timeoutMs === "number") {
    description.timeoutMs = config.timeoutMs;
  }

  if (config.url) {
    const grpcMatch = config.url.match(/^(?:qdrant\+)?grpc:\/\/([^/:]+)(?::(\d+))?/i);
    if (grpcMatch) {
      description.mode = "grpc";
      description.host = grpcMatch[1];
      if (grpcMatch[2]) {
        description.port = Number.parseInt(grpcMatch[2], 10);
      }
    } else {
      description.mode = "http";
      description.url = config.url;
    }
  }

  return new QdrantVectorStoreAdapter(description);
}

class MemoryIntegrationModule {}

export function createMemoryModule(options: MemoryModuleOptions): DynamicModule {
  const enabled = options.config?.enabled === true;
  const defaultStrategy = options.config?.facets?.defaultStrategy;
  const facetRegistry = new FacetRegistry(defaultStrategy, options.facets);

  const vectorAdapter =
    enabled && options.config.vectorStore?.provider === "qdrant"
      ? createQdrantVectorStoreAdapter(options.config.vectorStore.qdrant ?? {})
      : undefined;

  const client = enabled ? instantiateMem0Client(options.mem0) : undefined;
  const isOperational = enabled && !!client;

  const providers: Provider[] = [
    { provide: MEMORY_FACET_REGISTRY, useValue: facetRegistry },
    { provide: MEMORY_VECTOR_STORE, useValue: vectorAdapter },
    { provide: MEM0_CLIENT, useValue: client },
    {
      provide: MemoryFacade,
      useFactory: () =>
        new MemoryFacade({
          enabled: isOperational,
          client,
          vectorAdapter,
          facetRegistry,
          defaultStrategy,
        }),
    },
  ];

  return {
    module: MemoryIntegrationModule,
    providers,
    exports: [MemoryFacade, MEM0_CLIENT, MEMORY_VECTOR_STORE, MEMORY_FACET_REGISTRY],
  };
}

function instantiateMem0Client(
  credentials: MemoryModuleOptions["mem0"],
): MemoryClient | undefined {
  if (!credentials?.apiKey) {
    return undefined;
  }

  const clientOptions: Record<string, unknown> = {
    apiKey: credentials.apiKey,
  };

  if (credentials.host) {
    clientOptions.host = credentials.host;
  }
  if (credentials.projectId) {
    clientOptions.projectId = credentials.projectId;
  }
  if (credentials.projectName) {
    clientOptions.projectName = credentials.projectName;
  }
  if (credentials.organizationId) {
    clientOptions.organizationId = credentials.organizationId;
  }
  if (credentials.organizationName) {
    clientOptions.organizationName = credentials.organizationName;
  }

  return new MemoryClient(clientOptions as { apiKey: string });
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
