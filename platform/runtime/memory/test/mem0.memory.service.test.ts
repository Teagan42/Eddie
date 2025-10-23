import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { describe, expect, it, vi } from "vitest";
import {
  Mem0MemoryService,
  type Mem0MemoryServiceDependencies,
} from "../src/mem0.memory.service";
import {
  createMem0MemoryModule,
  MEM0_CLIENT_TOKEN,
  MEM0_FACET_EXTRACTOR_TOKEN,
  MEM0_VECTOR_STORE_TOKEN,
} from "../src/mem0.memory.module";

type FacetExtractorStub = Mem0MemoryServiceDependencies["facetExtractor"];

type VectorStoreStub = NonNullable<
  Mem0MemoryServiceDependencies["vectorStore"]
>;

describe("Mem0MemoryService", () => {
  it("delegates retrieval with combined filters", async () => {
    const searchMemories = vi.fn().mockResolvedValue([
      { id: "mem1", content: "hello" },
    ]);
    const client = {
      searchMemories,
      createMemories: vi.fn(),
    } satisfies Mem0MemoryServiceDependencies["client"];

    const service = new Mem0MemoryService({
      client,
    });

    const result = await service.loadAgentMemories({
      agentId: "agent-123",
      sessionId: "session-42",
      query: "greetings",
      limit: 5,
      metadata: { domain: "support" },
    });

    expect(result).toEqual([{ id: "mem1", content: "hello" }]);
    expect(searchMemories).toHaveBeenCalledWith({
      query: "greetings",
      topK: 5,
      filters: {
        agentId: "agent-123",
        sessionId: "session-42",
        domain: "support",
      },
    });
  });

  it("persists memories with base metadata, facets, and vector store", async () => {
    const createMemories = vi.fn().mockResolvedValue(undefined);
    const client = {
      searchMemories: vi.fn(),
      createMemories,
    } satisfies Mem0MemoryServiceDependencies["client"];

    const facetExtractor = {
      extract: vi.fn(() => ({ topic: "billing" })),
    } satisfies FacetExtractorStub;

    const service = new Mem0MemoryService({
      client,
      vectorStore: {
        describe: () => ({
          type: "qdrant",
          url: "https://qdrant.example",
          apiKey: "vector-key",
          collection: "agent-memories",
        }),
      } satisfies VectorStoreStub,
      facetExtractor,
    });

    await service.persistAgentMemories({
      agentId: "agent-123",
      sessionId: "session-42",
      userId: "user-7",
      metadata: { domain: "support" },
      memories: [
        { role: "user", content: "hello", metadata: { mood: "curious" } },
        { role: "assistant", content: "hi" },
      ],
    });

    expect(createMemories).toHaveBeenCalledTimes(1);
    const [payload] = createMemories.mock.calls[0] ?? [];

    expect(payload?.agentId).toBe("agent-123");
    expect(payload?.sessionId).toBe("session-42");
    expect(payload?.userId).toBe("user-7");
    expect(payload?.vectorStore).toEqual({
      type: "qdrant",
      url: "https://qdrant.example",
      apiKey: "vector-key",
      collection: "agent-memories",
    });
    expect(payload?.facets).toEqual({ topic: "billing" });
    expect(payload?.metadata).toMatchObject({
      agentId: "agent-123",
      sessionId: "session-42",
      userId: "user-7",
      domain: "support",
      facets: { topic: "billing" },
      vectorStore: {
        type: "qdrant",
        url: "https://qdrant.example",
        collection: "agent-memories",
      },
    });
    expect(payload?.metadata?.vectorStore).not.toHaveProperty("apiKey");

    expect(payload?.memories).toEqual([
      {
        role: "user",
        content: "hello",
        metadata: {
          agentId: "agent-123",
          sessionId: "session-42",
          userId: "user-7",
          domain: "support",
          facets: { topic: "billing" },
          vectorStore: {
            type: "qdrant",
            url: "https://qdrant.example",
            collection: "agent-memories",
          },
          mood: "curious",
        },
      },
      {
        role: "assistant",
        content: "hi",
        metadata: {
          agentId: "agent-123",
          sessionId: "session-42",
          userId: "user-7",
          domain: "support",
          facets: { topic: "billing" },
          vectorStore: {
            type: "qdrant",
            url: "https://qdrant.example",
            collection: "agent-memories",
          },
        },
      },
    ]);

    expect(facetExtractor.extract).toHaveBeenCalledWith(
      [
        { role: "user", content: "hello", metadata: { mood: "curious" } },
        { role: "assistant", content: "hi" },
      ],
      {
        agentId: "agent-123",
        sessionId: "session-42",
        userId: "user-7",
        metadata: { domain: "support" },
      },
    );
  });

  it("prevents per-memory metadata from overriding base metadata", async () => {
    const createMemories = vi.fn().mockResolvedValue(undefined);
    const client = {
      searchMemories: vi.fn(),
      createMemories,
    } satisfies Mem0MemoryServiceDependencies["client"];

    const service = new Mem0MemoryService({
      client,
    });

    await service.persistAgentMemories({
      agentId: "agent-123",
      sessionId: "session-42",
      userId: "user-7",
      metadata: { domain: "support" },
      memories: [
        {
          role: "user",
          content: "remember me",
          metadata: {
            agentId: "override-agent",
            sessionId: "override-session",
            userId: "override-user",
            vectorStore: { apiKey: "should-not-leak", url: "https://vector" },
            facets: { topic: "malicious" },
            mood: "curious",
          },
        },
      ],
    });

    const [payload] = createMemories.mock.calls[0] ?? [];
    const [memory] = payload?.memories ?? [];

    expect(memory?.metadata).toMatchObject({
      agentId: "agent-123",
      sessionId: "session-42",
      userId: "user-7",
      domain: "support",
      mood: "curious",
    });
    expect(memory?.metadata).not.toHaveProperty("vectorStore");
    expect(memory?.metadata).not.toHaveProperty("facets");

    expect(payload?.metadata).toMatchObject({
      agentId: "agent-123",
      sessionId: "session-42",
      userId: "user-7",
      domain: "support",
    });
  });

  it("is decorated as a Nest injectable", () => {
    const injectableMetadata = Reflect.getMetadata(
      "__injectable__",
      Mem0MemoryService,
    );

    expect(injectableMetadata).toBeDefined();
  });

  it("wires dependencies through the Nest module factory", async () => {
    const searchMemories = vi
      .fn<Mem0MemoryServiceDependencies["client"]["searchMemories"]>()
      .mockResolvedValue([]);
    const createMemories = vi
      .fn<Mem0MemoryServiceDependencies["client"]["createMemories"]>()
      .mockResolvedValue(undefined);
    const facetExtractor = {
      extract: vi.fn(() => ({ topic: "support" })),
    } satisfies FacetExtractorStub;

    const moduleRef = await Test.createTestingModule({
      imports: [
        createMem0MemoryModule({
          credentials: { apiKey: "token", host: "https://mem0.example" },
          vectorStore: {
            type: "qdrant",
            url: "https://qdrant.example",
            apiKey: "vector-key",
            collection: "agent-memories",
          },
          facetExtractor,
        }),
      ],
    })
      .overrideProvider(MEM0_CLIENT_TOKEN)
      .useValue({
        searchMemories,
        createMemories,
      } satisfies Mem0MemoryServiceDependencies["client"])
      .compile();

    const service = moduleRef.get(Mem0MemoryService);

    await service.loadAgentMemories({ query: "hello" });
    await service.persistAgentMemories({
      memories: [{ role: "user", content: "hi" }],
      metadata: { domain: "support" },
    });

    expect(searchMemories).toHaveBeenCalledWith({ query: "hello" });
    expect(createMemories).toHaveBeenCalledTimes(1);
    expect(facetExtractor.extract).toHaveBeenCalled();

    const vectorStoreProvider = moduleRef.get(MEM0_VECTOR_STORE_TOKEN, {
      strict: false,
    });
    expect(vectorStoreProvider?.describe()).toEqual({
      type: "qdrant",
      url: "https://qdrant.example",
      apiKey: "vector-key",
      collection: "agent-memories",
    });

    const providedFacetExtractor = moduleRef.get(
      MEM0_FACET_EXTRACTOR_TOKEN,
      { strict: false },
    );
    expect(providedFacetExtractor).toBe(facetExtractor);
  });
});
