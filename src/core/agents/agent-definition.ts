import type { PackedContext, ToolDefinition } from "../types";

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
   * Optional default context slice applied when an invocation does not supply
   * an explicit context override.
   */
  context?: PackedContext;
  /**
   * Tool definitions that should be registered for the agent.
   */
  tools?: ToolDefinition[];
}
