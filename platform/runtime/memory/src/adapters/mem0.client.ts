import { Inject, Injectable } from "@nestjs/common";
import {
  MEM0_MEMORY_MODULE_OPTIONS_TOKEN,
  type Mem0MemoryModuleOptions,
} from "../mem0.memory.module-definition";
import type { QdrantVectorStoreMetadata } from "./qdrant.vector-store";

export interface Mem0RestCredentials {
  apiKey: string;
  host?: string;
}

export interface Mem0SearchMemoriesRequest {
  query: string;
  topK?: number;
  filters?: Record<string, unknown>;
}

export interface Mem0MemoryRecord {
  id: string;
  content: string;
  role?: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

export interface Mem0MemoryMessage {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface Mem0CreateMemoriesRequest {
  agentId?: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  vectorStore?: QdrantVectorStoreMetadata;
  facets?: Record<string, unknown>;
  memories: Mem0MemoryMessage[];
}

interface Mem0SearchResponsePayload {
  data?: {
    memories?: Mem0MemoryRecord[];
  };
}

interface Mem0ErrorPayload {
  error?: {
    message?: string;
  };
}

@Injectable()
export class Mem0Client {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string;

  constructor(
      @Inject(MEM0_MEMORY_MODULE_OPTIONS_TOKEN)
        options: Mem0MemoryModuleOptions,
  ) {
    const credentials = options.credentials;
    const fetchImpl = globalThis.fetch;

    if (!credentials?.apiKey) {
      throw new Error("Mem0 API key is required");
    }

    if (typeof fetchImpl !== "function") {
      throw new Error("A fetch implementation is required for Mem0Client");
    }

    this.baseUrl = (credentials.host ?? "https://api.mem0.ai").replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.apiKey = credentials.apiKey;
  }

  async searchMemories(
    request: Mem0SearchMemoriesRequest,
  ): Promise<Mem0MemoryRecord[]> {
    const response = await this.request<Mem0SearchResponsePayload>(
      "/v1/memories/search",
      {
        method: "POST",
        body: JSON.stringify({
          query: request.query,
          filters: request.filters,
          top_k: request.topK,
        }),
      },
    );

    return response.data?.memories ?? [];
  }

  async createMemories(request: Mem0CreateMemoriesRequest): Promise<void> {
    if (!request.memories.length) {
      return;
    }

    const payload = this.stripUndefined({
      agent_id: request.agentId,
      session_id: request.sessionId,
      user_id: request.userId,
      metadata: request.metadata,
      vector_store: request.vectorStore,
      facets: request.facets,
      memories: request.memories.map((memory) =>
        this.stripUndefined({
          role: memory.role,
          content: memory.content,
          metadata: memory.metadata,
        }),
      ),
    });

    await this.request<void>("/v1/memories", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorBody = (await response.json()) as Mem0ErrorPayload;
        errorMessage = errorBody.error?.message ?? errorMessage;
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(`Mem0 request failed: ${errorMessage}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }
    return JSON.parse(text) as T;
  }

  private stripUndefined<T extends Record<string, unknown>>(value: T): T {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return Object.fromEntries(entries) as T;
  }
}
