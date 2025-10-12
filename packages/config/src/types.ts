import type { TemplateDescriptor, TemplateVariables } from "@eddie/templates";

export type LogLevel = "silent" | "info" | "debug" | "error";

export interface ApiTelemetryConfig {
  enabled?: boolean;
  consoleExporter?: boolean;
  /**
   * When `true`, stack traces from unexpected exceptions are included in HTTP
   * responses. The default behaviour only logs stack traces when debugging.
   */
  exposeErrorStack?: boolean;
}

export interface ApiValidationConfig {
  whitelist?: boolean;
  forbidNonWhitelisted?: boolean;
  transform?: boolean;
  enableImplicitConversion?: boolean;
}

export interface ApiCacheConfig {
  enabled?: boolean;
  ttlSeconds?: number;
  maxItems?: number;
}

export interface ApiAuthConfig {
  enabled?: boolean;
  apiKeys?: string[];
}

export type ApiCorsOrigin = boolean | string | string[];

export interface ApiCorsConfig {
  enabled?: boolean;
  origin?: ApiCorsOrigin;
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
  credentials?: boolean;
  maxAge?: number;
}

export interface ApiPersistenceSqliteConfig {
  filename?: string;
}

export interface ApiPersistenceSqlConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  [key: string]: unknown;
}

export interface ApiPersistenceSqlConfig {
  connection: ApiPersistenceSqlConnectionConfig;
  url?: string;
  ssl?: boolean;
  [key: string]: unknown;
}

export type ApiPersistenceConfig =
  | { driver: "memory" }
  | { driver: "sqlite"; sqlite?: ApiPersistenceSqliteConfig }
  | { driver: "postgres"; postgres: ApiPersistenceSqlConfig }
  | { driver: "mysql"; mysql: ApiPersistenceSqlConfig }
  | { driver: "mariadb"; mariadb: ApiPersistenceSqlConfig };

export interface ApiConfig {
  host?: string;
  port?: number;
  telemetry?: ApiTelemetryConfig;
  validation?: ApiValidationConfig;
  cache?: ApiCacheConfig;
  auth?: ApiAuthConfig;
  cors?: ApiCorsConfig;
  persistence?: ApiPersistenceConfig;
}

export interface ProviderConfig {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  version?: string;
  [key: string]: unknown;
}

export interface ProviderProfileConfig {
  provider: ProviderConfig;
  model?: string;
}

export type AgentProviderConfig = string | Partial<ProviderConfig>;

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
  variables?: TemplateVariables;
  resources?: ContextResourceConfig[];
}

export interface ContextResourceBaseConfig {
  id: string;
  name?: string;
  description?: string;
}

export interface ContextResourceBundleConfig extends ContextResourceBaseConfig {
  type: "bundle";
  include: string[];
  exclude?: string[];
  baseDir?: string;
  virtualPath?: string;
}

export interface ContextResourceTemplateConfig extends ContextResourceBaseConfig {
  type: "template";
  template: TemplateDescriptor;
  variables?: TemplateVariables;
}

export type ContextResourceConfig =
  | ContextResourceBundleConfig
  | ContextResourceTemplateConfig;

export interface AgentManagerConfig {
  prompt: string;
  instructions?: string;
  promptTemplate?: TemplateDescriptor;
  defaultUserPromptTemplate?: TemplateDescriptor;
  variables?: TemplateVariables;
  resources?: ContextResourceConfig[];
  model?: string;
  provider?: AgentProviderConfig;
  transcript?: TranscriptConfig;
  [key: string]: unknown;
}

export interface AgentDefinitionConfig {
  id: string;
  name?: string;
  description?: string;
  prompt?: string;
  promptTemplate?: TemplateDescriptor;
  defaultUserPromptTemplate?: TemplateDescriptor;
  variables?: TemplateVariables;
  resources?: ContextResourceConfig[];
  tools?: string[];
  routingThreshold?: number;
  model?: string;
  provider?: AgentProviderConfig;
  transcript?: TranscriptConfig;
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

export type TranscriptCompactorStrategy = "simple" | "token_budget";

export interface SimpleTranscriptCompactorConfig {
  strategy: "simple";
  maxMessages?: number;
  keepLast?: number;
}

export interface TokenBudgetTranscriptCompactorConfig {
  strategy: "token_budget";
  tokenBudget: number;
  keepTail?: number;
  hardFloor?: number;
}

export type TranscriptCompactorConfig =
  | SimpleTranscriptCompactorConfig
  | TokenBudgetTranscriptCompactorConfig;

export interface TranscriptConfig {
  compactor?: TranscriptCompactorConfig;
}

export interface EddieConfig {
  model: string;
  provider: ProviderConfig;
  projectDir: string;
  providers?: Record<string, ProviderProfileConfig>;
  context: ContextConfig;
  api?: ApiConfig;
  systemPrompt: string;
  logLevel: LogLevel;
  logging?: LoggingConfig;
  output?: OutputConfig;
  tools?: ToolsConfig;
  hooks?: HooksConfig;
  tokenizer?: TokenizerConfig;
  agents: AgentsConfig;
  transcript?: TranscriptConfig;
}

export interface EddieConfigInput {
  model?: string;
  provider?: Partial<ProviderConfig>;
  projectDir?: string;
  providers?: Record<string, ProviderProfileConfig>;
  context?: Partial<ContextConfig>;
  api?: Partial<ApiConfig>;
  systemPrompt?: string;
  logLevel?: LogLevel;
  logging?: Partial<LoggingConfig>;
  output?: Partial<OutputConfig>;
  tools?: Partial<ToolsConfig>;
  hooks?: Partial<HooksConfig>;
  tokenizer?: Partial<TokenizerConfig>;
  agents?: AgentsConfigInput;
  transcript?: TranscriptConfig;
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
  disableContext?: boolean;
  config?: string;
  model?: string;
  provider?: string;
  jsonlTrace?: string;
  autoApprove?: boolean;
  nonInteractive?: boolean;
  tools?: string[];
  /**
   * Tool identifiers to disable for this run (via `--disable-tools`).
   */
  disabledTools?: string[];
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
