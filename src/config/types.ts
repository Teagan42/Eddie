export type LogLevel = "silent" | "info" | "debug";

export interface ProviderConfig {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  version?: string;
  [key: string]: unknown;
}

export interface LoggingDestination {
  type: "stdout" | "stderr" | "file";
  path?: string;
  pretty?: boolean;
  colorize?: boolean;
}

export interface LoggingConfig {
  level: LogLevel;
  destination?: LoggingDestination;
  enableTimestamps?: boolean;
}

export interface ContextConfig {
  include: string[];
  exclude?: string[];
  baseDir?: string;
  maxBytes?: number;
  maxFiles?: number;
}

export interface AgentManagerConfig {
  prompt: string;
  instructions?: string;
  [key: string]: unknown;
}

export interface AgentDefinitionConfig {
  id: string;
  name?: string;
  description?: string;
  prompt?: string;
  tools?: string[];
  routingThreshold?: number;
  [key: string]: unknown;
}

export interface AgentRoutingConfig {
  confidenceThreshold?: number;
  maxDepth?: number;
  [key: string]: unknown;
}

export interface AgentsConfig {
  mode: string;
  manager: AgentManagerConfig;
  subagents: AgentDefinitionConfig[];
  routing?: AgentRoutingConfig;
  enableSubagents: boolean;
}

export interface EddieConfig {
  model: string;
  provider: ProviderConfig;
  context: ContextConfig;
  systemPrompt: string;
  logLevel: LogLevel;
  logging?: LoggingConfig;
  output?: OutputConfig;
  tools?: ToolsConfig;
  hooks?: HooksConfig;
  tokenizer?: TokenizerConfig;
  agents: AgentsConfig;
}

export interface EddieConfigInput {
  model?: string;
  provider?: Partial<ProviderConfig>;
  context?: Partial<ContextConfig>;
  systemPrompt?: string;
  logLevel?: LogLevel;
  logging?: Partial<LoggingConfig>;
  output?: Partial<OutputConfig>;
  tools?: Partial<ToolsConfig>;
  hooks?: Partial<HooksConfig>;
  tokenizer?: Partial<TokenizerConfig>;
  agents?: AgentsConfigInput;
}

export interface AgentsConfigInput {
  mode?: string;
  manager?: Partial<AgentManagerConfig>;
  subagents?: AgentDefinitionConfig[];
  routing?: Partial<AgentRoutingConfig>;
  enableSubagents?: boolean;
}

export interface CliRuntimeOptions {
  context?: string[];
  config?: string;
  model?: string;
  provider?: string;
  jsonlTrace?: string;
  autoApprove?: boolean;
  nonInteractive?: boolean;
  tools?: string[];
  logLevel?: LogLevel;
  logFile?: string;
  agentMode?: string;
  disableSubagents?: boolean;
}

export interface OutputConfig {
  jsonlTrace?: string;
  jsonlAppend?: boolean;
  directory?: string;
  prettyStream?: boolean;
}

export interface MCPBasicAuthConfig {
  type: "basic";
  username: string;
  password: string;
}

export interface MCPBearerAuthConfig {
  type: "bearer";
  token: string;
}

export interface MCPNoAuthConfig {
  type: "none";
}

export type MCPAuthConfig =
  | MCPBasicAuthConfig
  | MCPBearerAuthConfig
  | MCPNoAuthConfig;

export interface MCPToolSourceCapabilitiesConfig {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MCPToolSourceConfig {
  id: string;
  type: "mcp";
  url: string;
  name?: string;
  headers?: Record<string, string>;
  auth?: MCPAuthConfig;
  capabilities?: MCPToolSourceCapabilitiesConfig;
}

export type ToolSourceConfig = MCPToolSourceConfig;

export interface ToolsConfig {
  enabled?: string[];
  disabled?: string[];
  autoApprove?: boolean;
  sources?: ToolSourceConfig[];
}

export interface HooksConfig {
  modules?: string[];
  directory?: string;
}

export interface TokenizerConfig {
  provider?: string;
}
