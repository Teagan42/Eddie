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
}

export interface OutputConfig {
  jsonlTrace?: string;
  jsonlAppend?: boolean;
  directory?: string;
  prettyStream?: boolean;
}

export interface ToolsConfig {
  enabled?: string[];
  disabled?: string[];
  autoApprove?: boolean;
}

export interface HooksConfig {
  modules?: string[];
  directory?: string;
}

export interface TokenizerConfig {
  provider?: string;
}
