import type { ToolDefinition } from "@eddie/types";

export interface McpResourceDescription {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
  schema?: Record<string, unknown>;
}

export interface McpPromptDescription {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpPromptMessage {
  role: string;
  content: unknown[];
}

export interface McpPromptDefinition extends McpPromptDescription {
  messages: McpPromptMessage[];
}

export interface McpToolSourceDiscovery {
  sourceId: string;
  tools: ToolDefinition[];
  resources: McpResourceDescription[];
  prompts: McpPromptDefinition[];
}

export interface DiscoveredMcpResource extends McpResourceDescription {
  sourceId: string;
}

export interface DiscoveredMcpPrompt extends McpPromptDefinition {
  sourceId: string;
}
