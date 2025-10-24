export interface QdrantVectorStoreDescriptor {
  type: "qdrant";
  url: string;
  apiKey?: string;
  collection?: string;
  timeoutMs?: number;
}

export interface QdrantVectorStoreMetadata {
  type: "qdrant";
  url: string;
  apiKey?: string;
  collection?: string;
  timeoutMs?: number;
}

export class QdrantVectorStore {
  private readonly metadata: QdrantVectorStoreMetadata;

  constructor(descriptor: QdrantVectorStoreDescriptor) {
    if (descriptor.type !== "qdrant") {
      throw new Error(`Unsupported vector store type: ${descriptor.type}`);
    }

    if (!descriptor.url) {
      throw new Error("Qdrant vector store requires a url");
    }

    this.metadata = {
      type: "qdrant",
      url: descriptor.url,
      apiKey: descriptor.apiKey,
      collection: descriptor.collection,
      ...(typeof descriptor.timeoutMs === "number"
        ? { timeoutMs: descriptor.timeoutMs }
        : {}),
    };
  }

  describe(): QdrantVectorStoreMetadata {
    return { ...this.metadata };
  }
}
