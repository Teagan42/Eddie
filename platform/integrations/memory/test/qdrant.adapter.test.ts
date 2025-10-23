import { describe, expect, it } from "vitest";
import { createQdrantVectorStoreAdapter } from "../src";

describe("createQdrantVectorStoreAdapter", () => {
  it("maps http URLs to http mode", () => {
    const adapter = createQdrantVectorStoreAdapter({
      url: "http://localhost:6333",
      apiKey: "secret",
      collection: "eddie-memory",
      timeoutMs: 5000,
    });

    expect(adapter.describe()).toEqual({
      provider: "qdrant",
      mode: "http",
      url: "http://localhost:6333",
      apiKey: "secret",
      collection: "eddie-memory",
      timeoutMs: 5000,
    });
  });

  it("maps grpc URLs to grpc mode", () => {
    const adapter = createQdrantVectorStoreAdapter({
      url: "grpc://qdrant.internal:6334",
      collection: "eddie-memory",
    });

    expect(adapter.describe()).toEqual({
      provider: "qdrant",
      mode: "grpc",
      host: "qdrant.internal",
      port: 6334,
      collection: "eddie-memory",
    });
  });

  it("throws when collection is missing", () => {
    expect(() => createQdrantVectorStoreAdapter({ url: "http://localhost:6333" })).toThrow(
      /collection/i,
    );
  });
});
