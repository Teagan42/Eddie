import type { TemplateDescriptor, TemplateVariables } from "../../shared/template.types";
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
   * Optional template used to render {@link systemPrompt} with runtime variables.
   */
  systemPromptTemplate?: TemplateDescriptor;
  /**
   * Optional template used to render the user prompt when none is supplied at
   * invocation time.
   */
  userPromptTemplate?: TemplateDescriptor;
  /**
   * Default variables injected into prompt templates for this agent.
   */
  variables?: TemplateVariables;
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
