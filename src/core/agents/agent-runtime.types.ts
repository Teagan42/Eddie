import type { AgentDefinition } from "./agent-definition";
import type { ProviderAdapter } from "../types";

export interface AgentRuntimeMetadata {
  name?: string;
  description?: string;
  routingThreshold?: number;
  profileId?: string;
}

export interface AgentRuntimeDescriptor {
  id: string;
  definition: AgentDefinition;
  model: string;
  provider: ProviderAdapter;
  metadata?: AgentRuntimeMetadata;
}

export interface AgentRuntimeCatalog {
  readonly enableSubagents: boolean;
  getManager(): AgentRuntimeDescriptor;
  getAgent(id: string): AgentRuntimeDescriptor | undefined;
  getSubagent(id: string): AgentRuntimeDescriptor | undefined;
  listSubagents(): AgentRuntimeDescriptor[];
}
