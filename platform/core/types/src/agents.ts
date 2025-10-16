import type { TemplateDescriptor, TemplateVariables } from "./config";
import type {
  ChatMessage,
  PackedContext,
  ProviderAdapter,
  ToolDefinition,
} from "./providers";

/**
 * Unique identifier and prompt configuration for an agent.
 */
export interface AgentDefinition {
  /**
   * Unique identifier for the agent. Used for trace attribution and logging.
   */
  id: string;
  /**
   * Base system prompt applied to every invocation.
   */
  systemPrompt: string;
  /**
   * Optional template used to render {@link systemPrompt} with runtime variables.
   */
  systemPromptTemplate?: TemplateDescriptor;
  /**
   * Optional template used to render the user prompt when none is supplied at invocation time.
   */
  userPromptTemplate?: TemplateDescriptor;
  /**
   * Default variables injected into prompt templates for this agent.
   */
  variables?: TemplateVariables;
  /**
   * Optional default context slice applied when an invocation does not supply an explicit context override.
   */
  context?: PackedContext;
  /**
   * Tool definitions that should be registered for the agent.
   */
  tools?: ToolDefinition[];
}

/**
 * @internal Runtime placeholder allowing module resolution checks in tests.
 * Consumers should import {@link AgentDefinition} as a type only.
 */
// eslint-disable-next-line no-redeclare
export const AgentDefinition = undefined as unknown as AgentDefinition;

export interface AgentInvocationOptions {
  prompt: string;
  context?: PackedContext;
  history?: ChatMessage[];
  promptTemplate?: TemplateDescriptor;
  variables?: TemplateVariables;
}

export interface AgentInvocationRuntimeDetails {
  provider: string;
  model: string;
  metadata?: Record<string, unknown>;
}

export type AgentSpawnHandler<TInvocation = unknown> = (
  definition: AgentDefinition,
  options: AgentInvocationOptions
) => Promise<TInvocation>;

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
