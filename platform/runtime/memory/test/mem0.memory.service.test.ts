import { describe, expect, it, vi } from "vitest";
import { Mem0MemoryService } from "../src/mem0.memory.service";

describe("Mem0MemoryService", () => {
  it("delegates retrieval with combined filters", async () => {
    const searchMemories = vi.fn().mockResolvedValue([
      { id: "mem1", content: "hello" },
    ]);
    const client = {
      searchMemories,
      createMemories: vi.fn(),
    };

    const service = new Mem0MemoryService(
      { apiKey: "token", host: "https://mem0.example" },
      undefined,
      undefined,
      client as any,
    );

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
    };

    const facetExtractor = {
      extract: vi.fn(() => ({ topic: "billing" })),
    };

    const service = new Mem0MemoryService(
      { apiKey: "token", host: "https://mem0.example" },
      {
        type: "qdrant",
        url: "https://qdrant.example",
        apiKey: "vector-key",
        collection: "agent-memories",
      },
      facetExtractor as any,
      client as any,
    );

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

    for (const memory of payload?.memories ?? []) {
      expect(memory.metadata?.vectorStore).not.toHaveProperty("apiKey");
    }

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
});
