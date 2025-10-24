import type {
  AgentRecalledMemory,
  AgentRuntimeDescriptor,
  SessionMetadata,
} from "@eddie/types";

export interface AgentMemoryRecallContext {
  agent: AgentRuntimeDescriptor;
  query: string;
  session?: SessionMetadata;
  metadata?: Record<string, unknown>;
  maxBytes?: number;
}

export interface AgentMemoryAdapter {
  recallMemories(
    request: AgentMemoryRecallContext
  ): Promise<AgentRecalledMemory[]>;
}

export interface AgentMemoryRuntime {
  adapter: AgentMemoryAdapter;
  session?: SessionMetadata;
  metadata?: Record<string, unknown>;
}
