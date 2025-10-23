import {
  Mem0Client,
  type Mem0CreateMemoriesRequest,
  type Mem0MemoryMessage,
  type Mem0MemoryRecord,
  type Mem0RestCredentials,
  type Mem0SearchMemoriesRequest,
} from "./adapters/mem0.client";
import {
  QdrantVectorStore,
  type QdrantVectorStoreDescriptor,
  type QdrantVectorStoreMetadata,
} from "./adapters/qdrant.vector-store";

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

type Mem0ClientContract = Pick<Mem0Client, "searchMemories" | "createMemories">;

export class Mem0MemoryService {
  private readonly client: Mem0ClientContract;
  private readonly vectorStore?: QdrantVectorStore;
  private readonly facetExtractor?: FacetExtractorStrategy;

  constructor(
    credentials: Mem0RestCredentials,
    vectorStore?: QdrantVectorStoreDescriptor,
    facetExtractor?: FacetExtractorStrategy,
    client?: Mem0ClientContract,
  ) {
    this.client = client ?? new Mem0Client(credentials);
    this.vectorStore = vectorStore
      ? new QdrantVectorStore(vectorStore)
      : undefined;
    this.facetExtractor = facetExtractor;
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
    const context: FacetExtractionContext = {
      agentId: options.agentId,
      sessionId: options.sessionId,
      userId: options.userId,
      metadata: options.metadata,
    };

    const rawFacets = this.facetExtractor?.extract(options.memories, context);
    const facets = this.normalizeFacets(rawFacets);

    const baseMetadata = this.buildBaseMetadata(options, vectorStore, facets);

    const memories: Mem0MemoryMessage[] = options.memories.map((memory) => ({
      role: memory.role,
      content: memory.content,
      metadata: {
        ...baseMetadata,
        ...(memory.metadata ?? {}),
      },
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
}
