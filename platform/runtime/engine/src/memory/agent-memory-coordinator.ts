import { Injectable, Optional } from "@nestjs/common";
import type {
  AgentMemoryConfig,
  AgentRuntimeDescriptor,
  ChatMessage,
  MemoryConfig,
  SessionMetadata,
} from "@eddie/types";
import type { AgentInvocation } from "../agents/agent-invocation";
import type { AgentRuntimeOptions } from "../agents/agent-orchestrator.service";
import {
  Mem0MemoryService,
  type AgentMemoryRecord as PersistableAgentMemoryRecord,
} from "@eddie/memory";

export interface AgentMemoryBinding {
  prepareProviderMessages(options: {
    messages: ChatMessage[];
    invocation: AgentInvocation;
    descriptor: AgentRuntimeDescriptor;
  }): Promise<ChatMessage[]>;
  finalize(options: {
    invocation: AgentInvocation;
    descriptor: AgentRuntimeDescriptor;
    newMessages: ChatMessage[];
    failed: boolean;
  }): Promise<void>;
}

export interface AgentMemoryBindingContext {
  descriptor: AgentRuntimeDescriptor;
  invocation: AgentInvocation;
  runtime: AgentRuntimeOptions;
  session?: SessionMetadata;
}

interface ResolvedAgentMemoryConfig {
  recall: boolean;
  store: boolean;
  facets?: MemoryConfig["facets"];
  vectorStore?: MemoryConfig["vectorStore"];
}

type LoadedMemoryRecord = Awaited<
  ReturnType<Mem0MemoryService["loadAgentMemories"]>
>[number];

type MemoryDefaults = MemoryConfig & Partial<Pick<AgentMemoryConfig, "recall" | "store">>;

type PersistOptions = Parameters<Mem0MemoryService["persistAgentMemories"]>[0];
type MetadataOverride = PersistOptions["metadata"];
type VectorStoreOverride = PersistOptions["vectorStore"];

@Injectable()
export class AgentMemoryCoordinator {
  constructor(
    @Optional()
    private readonly mem0MemoryService?: Mem0MemoryService,
  ) {}

  async createBinding(
    context: AgentMemoryBindingContext,
  ): Promise<AgentMemoryBinding | undefined> {
    if (!this.mem0MemoryService) {
      return undefined;
    }

    const resolved = this.resolveAgentMemoryConfig(
      context.descriptor.metadata?.memory,
      context.runtime.memoryDefaults,
    );

    if (!resolved) {
      return undefined;
    }

    return new Mem0AgentMemoryBinding({
      service: this.mem0MemoryService,
      descriptor: context.descriptor,
      invocation: context.invocation,
      runtime: context.runtime,
      config: resolved,
    });
  }

  private resolveAgentMemoryConfig(
    agentConfig: AgentMemoryConfig | undefined,
    defaults: MemoryConfig | undefined,
  ): ResolvedAgentMemoryConfig | undefined {
    if (defaults?.enabled === false) {
      return undefined;
    }

    const defaultsWithFlags = defaults as MemoryDefaults | undefined;
    const memory = agentConfig ?? ({} as AgentMemoryConfig);

    const recall = memory.recall ?? defaultsWithFlags?.recall ?? false;
    const store = memory.store ?? defaultsWithFlags?.store ?? false;

    if (!recall && !store) {
      return undefined;
    }

    return {
      recall,
      store,
      facets: memory.facets ?? defaults?.facets,
      vectorStore: memory.vectorStore ?? defaults?.vectorStore,
    };
  }
}

interface Mem0BindingDependencies {
  service: Mem0MemoryService;
  descriptor: AgentRuntimeDescriptor;
  invocation: AgentInvocation;
  runtime: AgentRuntimeOptions;
  config: ResolvedAgentMemoryConfig;
}

class Mem0AgentMemoryBinding implements AgentMemoryBinding {
  private recalledMessages?: ChatMessage[];
  private lastRecallQuery?: string;
  private readonly sessionId?: string;
  private readonly metadataOverrides?: MetadataOverride;
  private readonly vectorStoreOverride?: VectorStoreOverride;

  constructor(private readonly deps: Mem0BindingDependencies) {
    this.sessionId = deps.runtime.session?.id ?? deps.runtime.sessionId;
    this.metadataOverrides = this.computeMetadataOverrides();
    this.vectorStoreOverride = this.computeVectorStoreOverride();
  }

  async prepareProviderMessages(options: {
    messages: ChatMessage[];
    invocation: AgentInvocation;
    descriptor: AgentRuntimeDescriptor;
  }): Promise<ChatMessage[]> {
    if (!this.deps.config.recall) {
      return options.messages;
    }

    const recallQuery = this.resolveRecallQuery(options.messages);

    if (this.lastRecallQuery !== recallQuery) {
      this.recalledMessages = await this.loadRecalledMessages(recallQuery);
      this.lastRecallQuery = recallQuery;
    }

    const recalledMessages = this.recalledMessages ?? [];

    if (recalledMessages.length === 0) {
      return options.messages;
    }

    if (this.messagesAlreadyContainRecall(options.messages, recalledMessages)) {
      return options.messages;
    }

    const finalPrompt = options.messages.at(-1);

    if (!finalPrompt) {
      return recalledMessages;
    }

    const leadingMessages = options.messages.slice(0, -1);

    return [...leadingMessages, ...recalledMessages, finalPrompt];
  }

  async finalize(options: {
    invocation: AgentInvocation;
    descriptor: AgentRuntimeDescriptor;
    newMessages: ChatMessage[];
    failed: boolean;
  }): Promise<void> {
    if (!this.deps.config.store || options.failed) {
      return;
    }

    const memories = options.newMessages
      .filter((message) => message.role === "assistant")
      .map((message) => this.toAgentMemoryRecord(message))
      .filter((record): record is PersistableAgentMemoryRecord => Boolean(record));

    if (memories.length === 0) {
      return;
    }

    await this.deps.service.persistAgentMemories({
      agentId: this.deps.descriptor.id,
      sessionId: this.sessionId,
      ...(this.metadataOverrides ? { metadata: this.metadataOverrides } : {}),
      ...(this.vectorStoreOverride ? { vectorStore: this.vectorStoreOverride } : {}),
      memories,
    });
  }

  private toChatMessage(record: LoadedMemoryRecord): ChatMessage | undefined {
    if (!record?.content) {
      return undefined;
    }

    const role = record.role === "user" ? "user" : "assistant";
    return {
      role,
      content: record.content,
    };
  }

  private toAgentMemoryRecord(
    message: ChatMessage,
  ): PersistableAgentMemoryRecord | undefined {
    if (!message.content?.trim()) {
      return undefined;
    }

    return {
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    };
  }

  private resolveRecallQuery(messages: ChatMessage[]): string {
    const latestUserMessage = this.extractLatestUserContent(messages);
    return latestUserMessage ?? this.deps.invocation.prompt;
  }

  private extractLatestUserContent(messages: ChatMessage[]): string | undefined {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "user" && message.content) {
        return message.content;
      }
    }

    return undefined;
  }

  private async loadRecalledMessages(query: string): Promise<ChatMessage[]> {
    const records = await this.deps.service.loadAgentMemories({
      agentId: this.deps.descriptor.id,
      sessionId: this.sessionId,
      query,
      ...(this.metadataOverrides ? { metadata: this.metadataOverrides } : {}),
      ...(this.vectorStoreOverride ? { vectorStore: this.vectorStoreOverride } : {}),
    });

    if (!records?.length) {
      return [];
    }

    return records
      .map((record) => this.toChatMessage(record))
      .filter((message): message is ChatMessage => Boolean(message));
  }

  private messagesAlreadyContainRecall(
    messages: ChatMessage[],
    recalled: ChatMessage[],
  ): boolean {
    if (recalled.length === 0) {
      return false;
    }

    if (messages.length < recalled.length + 1) {
      return false;
    }

    const recallWindow = messages.slice(-1 - recalled.length, -1);

    if (recallWindow.length !== recalled.length) {
      return false;
    }

    return recalled.every((message, index) =>
      this.messagesEqual(message, recallWindow[index]!),
    );
  }

  private messagesEqual(a: ChatMessage, b: ChatMessage): boolean {
    return a.role === b.role && a.content === b.content;
  }

  private computeMetadataOverrides(): MetadataOverride | undefined {
    const facets = this.deps.config.facets;
    if (!facets) {
      return undefined;
    }

    return { facets };
  }

  private computeVectorStoreOverride(): VectorStoreOverride | undefined {
    const vectorStore = this.deps.config.vectorStore;
    if (!vectorStore || vectorStore.provider !== "qdrant") {
      return undefined;
    }

    const qdrant = vectorStore.qdrant;
    if (!qdrant?.url) {
      return undefined;
    }

    const override: NonNullable<VectorStoreOverride> = {
      type: "qdrant",
      url: qdrant.url,
    };

    if (qdrant.apiKey) {
      override.apiKey = qdrant.apiKey;
    }

    if (qdrant.collection) {
      override.collection = qdrant.collection;
    }

    if (typeof qdrant.timeoutMs === "number") {
      override.timeoutMs = qdrant.timeoutMs;
    }

    return override;
  }
}
