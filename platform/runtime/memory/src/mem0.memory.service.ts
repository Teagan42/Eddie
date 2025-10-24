import { Inject, Injectable, Optional } from "@nestjs/common";
import {
  type Mem0CreateMemoriesRequest,
  type Mem0MemoryMessage,
  type Mem0MemoryRecord,
  type Mem0SearchMemoriesRequest,
} from "./adapters/mem0.client";
import {
  type QdrantVectorStore,
  type QdrantVectorStoreMetadata,
} from "./adapters/qdrant.vector-store";
import {
  MEM0_CLIENT_TOKEN,
  MEM0_FACET_EXTRACTOR_TOKEN,
  MEM0_VECTOR_STORE_TOKEN,
} from "./mem0.memory.tokens";

export interface AgentMemoryRecord {
  id?: string;
  content: string;
  role: "user" | "assistant";
  metadata?: Record<string, unknown>;
}

export interface LoadAgentMemoriesOptions {
  agentId?: string;
  sessionId?: string;
  query: string;
  limit?: number;
  metadata?: Record<string, unknown>;
}

export interface PersistAgentMemoriesOptions {
  agentId?: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  memories: AgentMemoryRecord[];
}

export interface FacetExtractionContext {
  agentId?: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface FacetExtractorStrategy {
  extract(
    memories: AgentMemoryRecord[],
    context: FacetExtractionContext,
  ): Record<string, unknown> | undefined;
}

const PROTECTED_MEMORY_METADATA_KEYS = new Set([
  "agentId",
  "sessionId",
  "userId",
  "vectorStore",
  "facets",
]);

interface Mem0ClientContract {
  searchMemories(
    request: Mem0SearchMemoriesRequest,
  ): Promise<Mem0MemoryRecord[]>;
  createMemories(request: Mem0CreateMemoriesRequest): Promise<void>;
}

export interface Mem0MemoryServiceDependencies {
  client: Mem0ClientContract;
  vectorStore?: QdrantVectorStore;
  facetExtractor?: FacetExtractorStrategy;
}

@Injectable()
export class Mem0MemoryService {
  private readonly client: Mem0ClientContract;
  private readonly vectorStore?: QdrantVectorStore;
  private readonly facetExtractor?: FacetExtractorStrategy;

  constructor(
    @Inject(MEM0_CLIENT_TOKEN)
    client: Mem0MemoryServiceDependencies["client"],
    @Optional()
    @Inject(MEM0_VECTOR_STORE_TOKEN)
    vectorStore?: QdrantVectorStore,
    @Optional()
    @Inject(MEM0_FACET_EXTRACTOR_TOKEN)
    facetExtractor?: FacetExtractorStrategy,
  ) {
    this.client = client;
    this.vectorStore = vectorStore;
    this.facetExtractor = facetExtractor;
  }

  static create(
    dependencies: Mem0MemoryServiceDependencies,
  ): Mem0MemoryService {
    return new Mem0MemoryService(
      dependencies.client,
      dependencies.vectorStore,
      dependencies.facetExtractor,
    );
  }

  async loadAgentMemories(
    options: LoadAgentMemoriesOptions,
  ): Promise<Mem0MemoryRecord[]> {
    const filters: Record<string, unknown> = { ...(options.metadata ?? {}) };

    if (options.agentId) {
      filters.agentId = options.agentId;
    }
    if (options.sessionId) {
      filters.sessionId = options.sessionId;
    }

    const payload: Mem0SearchMemoriesRequest = {
      query: options.query,
    };

    if (typeof options.limit === "number") {
      payload.topK = options.limit;
    }

    if (Object.keys(filters).length > 0) {
      payload.filters = filters;
    }

    return this.client.searchMemories(payload);
  }

  async persistAgentMemories(options: PersistAgentMemoriesOptions): Promise<void> {
    if (!options.memories?.length) {
      return;
    }

    const vectorStore = this.vectorStore?.describe();
    const sanitizedVectorStore = vectorStore
      ? this.redactVectorStoreSecrets(vectorStore)
      : undefined;
    const context: FacetExtractionContext = {
      agentId: options.agentId,
      sessionId: options.sessionId,
      userId: options.userId,
      metadata: options.metadata,
    };

    const rawFacets = this.facetExtractor?.extract(options.memories, context);
    const facets = this.normalizeFacets(rawFacets);

    const baseMetadata = this.buildBaseMetadata(
      options,
      sanitizedVectorStore,
      facets,
    );

    const memories: Mem0MemoryMessage[] = options.memories.map((memory) => ({
      role: memory.role,
      content: memory.content,
      metadata: this.mergeMemoryMetadata(memory.metadata, baseMetadata),
    }));

    const payload: Mem0CreateMemoriesRequest = {
      agentId: options.agentId,
      sessionId: options.sessionId,
      userId: options.userId,
      metadata: baseMetadata,
      vectorStore,
      facets,
      memories,
    };

    await this.client.createMemories(payload);
  }

  private mergeMemoryMetadata(
    memoryMetadata: Record<string, unknown> | undefined,
    baseMetadata: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!memoryMetadata) {
      return { ...baseMetadata };
    }

    const sanitizedMemoryMetadata = Object.fromEntries(
      Object.entries(memoryMetadata).filter(
        ([key]) => !PROTECTED_MEMORY_METADATA_KEYS.has(key),
      ),
    );

    return {
      ...sanitizedMemoryMetadata,
      ...baseMetadata,
    };
  }

  private buildBaseMetadata(
    options: PersistAgentMemoriesOptions,
    vectorStore?: QdrantVectorStoreMetadata,
    facets?: Record<string, unknown>,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      ...(options.metadata ?? {}),
    };

    if (options.agentId) {
      metadata.agentId = options.agentId;
    }
    if (options.sessionId) {
      metadata.sessionId = options.sessionId;
    }
    if (options.userId) {
      metadata.userId = options.userId;
    }
    if (vectorStore) {
      metadata.vectorStore = vectorStore;
    }
    if (facets) {
      metadata.facets = facets;
    }

    return metadata;
  }

  private normalizeFacets(
    facets: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!facets) {
      return undefined;
    }

    return Object.keys(facets).length > 0 ? facets : undefined;
  }

  private redactVectorStoreSecrets(
    vectorStore: QdrantVectorStoreMetadata,
  ): QdrantVectorStoreMetadata {
    const { apiKey: _apiKey, ...rest } = vectorStore;
    const sanitized: QdrantVectorStoreMetadata = { ...rest };
    return sanitized;
  }
}
