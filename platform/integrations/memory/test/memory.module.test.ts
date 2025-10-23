import { Test } from "@nestjs/testing";
import type { MemoryConfig } from "@eddie/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryModule,
  MemoryFacade,
  type FacetExtractionStrategy,
  type MemoryStoreRequest,
} from "../src";

const { MemoryClientMock, addMock, searchMock } = vi.hoisted(() => {
  const add = vi.fn();
  const search = vi.fn();
  const client = vi.fn().mockImplementation(() => ({
    add,
    search,
  }));

  return {
    MemoryClientMock: client,
    addMock: add,
    searchMock: search,
  };
});

vi.mock("mem0ai", () => ({
  MemoryClient: MemoryClientMock,
  default: MemoryClientMock,
}));

describe("createMemoryModule", () => {
  beforeEach(() => {
    addMock.mockReset();
    searchMock.mockReset();
    MemoryClientMock.mockClear();
  });

  it("initializes mem0 with qdrant http adapter and stores metadata", async () => {
    const semanticExtractor = vi.fn().mockReturnValue({ facets: { topic: "testing" } });

    const strategies: Record<string, () => FacetExtractionStrategy> = {
      semantic: () => ({
        name: "semantic",
        extract: semanticExtractor,
      }),
    };

    const config: MemoryConfig = {
      enabled: true,
      facets: { defaultStrategy: "semantic" },
      vectorStore: {
        provider: "qdrant",
        qdrant: {
          url: "http://localhost:6333",
          apiKey: "qdrant-api",
          collection: "team",
          timeoutMs: 6100,
        },
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        createMemoryModule({
          config,
          mem0: {
            apiKey: "mem0-key",
            host: "https://mem0.example.com",
            projectId: "project-123",
          },
          facets: { strategies },
        }),
      ],
    }).compile();

    const facade = moduleRef.get(MemoryFacade);

    const request: MemoryStoreRequest = {
      agentId: "manager",
      sessionId: "session-123",
      userId: "user-41",
      metadata: { extra: "value" },
      memories: [
        {
          role: "assistant",
          content: "Remember to write tests",
          metadata: { intent: "tdd" },
        },
      ],
    };

    await facade.storeMemories(request);

    expect(MemoryClientMock).toHaveBeenCalledWith({
      apiKey: "mem0-key",
      host: "https://mem0.example.com",
      projectId: "project-123",
    });

    expect(semanticExtractor).toHaveBeenCalledWith(
      request.memories[0],
      expect.objectContaining({
        agentId: "manager",
        sessionId: "session-123",
        userId: "user-41",
        metadata: { extra: "value" },
      }),
    );

    expect(addMock).toHaveBeenCalledTimes(1);
    expect(addMock).toHaveBeenCalledWith(
      [
        {
          role: "assistant",
          content: "Remember to write tests",
        },
      ],
      expect.objectContaining({
        metadata: expect.objectContaining({
          agentId: "manager",
          sessionId: "session-123",
          userId: "user-41",
          vectorStore: expect.objectContaining({
            provider: "qdrant",
            mode: "http",
            collection: "team",
            url: "http://localhost:6333",
            apiKey: "qdrant-api",
            timeoutMs: 6100,
          }),
          facets: { topic: "testing" },
          extra: "value",
        }),
      }),
    );
  });

  it("recalls memories using search parameters", async () => {
    const results = [{ id: "1", memory: "Remember the plan" }];
    searchMock.mockResolvedValue(results);

    const config: MemoryConfig = {
      enabled: true,
      vectorStore: {
        provider: "qdrant",
        qdrant: {
          url: "grpc://vector.example.com:6334",
          collection: "team",
        },
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        createMemoryModule({
          config,
          mem0: { apiKey: "mem0-key" },
        }),
      ],
    }).compile();

    const facade = moduleRef.get(MemoryFacade);

    const recalled = await facade.recallMemories({
      query: "plan",
      topK: 5,
      agentId: "manager",
      sessionId: "session-123",
    });

    expect(searchMock).toHaveBeenCalledWith(
      "plan",
      expect.objectContaining({
        top_k: 5,
        filters: expect.objectContaining({
          agentId: "manager",
          sessionId: "session-123",
        }),
      }),
    );
    expect(recalled).toEqual(results);
  });

  it("uses request strategy overrides when extracting facets", async () => {
    const semanticExtractor = vi.fn();
    const tagExtractor = vi.fn().mockReturnValue({ facets: { tags: ["urgent"] } });

    const strategies: Record<string, () => FacetExtractionStrategy> = {
      semantic: () => ({ name: "semantic", extract: semanticExtractor }),
      tags: () => ({ name: "tags", extract: tagExtractor }),
    };

    const config: MemoryConfig = {
      enabled: true,
      facets: { defaultStrategy: "semantic" },
      vectorStore: {
        provider: "qdrant",
        qdrant: {
          url: "http://localhost:6333",
          collection: "team",
        },
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        createMemoryModule({
          config,
          mem0: { apiKey: "mem0-key" },
          facets: { strategies },
        }),
      ],
    }).compile();

    const facade = moduleRef.get(MemoryFacade);

    await facade.storeMemories({
      strategy: "tags",
      memories: [
        { role: "assistant", content: "Remember the urgent note" },
        { role: "assistant", content: "And the next one" },
      ],
      batchSize: 2,
    });

    expect(tagExtractor).toHaveBeenCalledTimes(2);
    expect(semanticExtractor).not.toHaveBeenCalled();
    expect(addMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to noop facade when memory disabled", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        createMemoryModule({
          config: { enabled: false },
        }),
      ],
    }).compile();

    const facade = moduleRef.get(MemoryFacade);
    await facade.storeMemories({
      memories: [{ role: "assistant", content: "noop" }],
    });

    expect(addMock).not.toHaveBeenCalled();
    expect(MemoryClientMock).not.toHaveBeenCalled();

    const recalled = await facade.recallMemories({ query: "noop" });
    expect(recalled).toEqual([]);
  });
});
