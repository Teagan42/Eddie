import type { CliRuntimeOptions, LogLevel } from "./types";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);
const LOG_LEVEL_VALUES = new Set<LogLevel>(["silent", "info", "debug", "error"]);

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  return undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    return [];
  }

  return items;
}

function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (LOG_LEVEL_VALUES.has(normalized as LogLevel)) {
    return normalized as LogLevel;
  }

  return undefined;
}

function parseString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveCliRuntimeOptionsFromEnv(
  env: NodeJS.ProcessEnv
): CliRuntimeOptions {
  const context = parseList(env.EDDIE_CLI_CONTEXT);
  const tools = parseList(env.EDDIE_CLI_TOOLS);
  const disabledTools = parseList(env.EDDIE_CLI_DISABLED_TOOLS);

  const disableContext = parseBoolean(env.EDDIE_CLI_DISABLE_CONTEXT);
  const autoApprove = parseBoolean(env.EDDIE_CLI_AUTO_APPROVE);
  const nonInteractive = parseBoolean(env.EDDIE_CLI_NON_INTERACTIVE);
  const disableSubagents = parseBoolean(env.EDDIE_CLI_DISABLE_SUBAGENTS);

  const logLevel = parseLogLevel(env.EDDIE_CLI_LOG_LEVEL);

  const options: CliRuntimeOptions = {};

  if (context !== undefined) {
    options.context = context;
  }

  if (disableContext !== undefined) {
    options.disableContext = disableContext;
  }

  const config = parseString(env.EDDIE_CLI_CONFIG);
  if (config !== undefined) {
    options.config = config;
  }

  const model = parseString(env.EDDIE_CLI_MODEL);
  if (model !== undefined) {
    options.model = model;
  }

  const provider = parseString(env.EDDIE_CLI_PROVIDER);
  if (provider !== undefined) {
    options.provider = provider;
  }

  const jsonlTrace = parseString(env.EDDIE_CLI_JSONL_TRACE);
  if (jsonlTrace !== undefined) {
    options.jsonlTrace = jsonlTrace;
  }

  if (autoApprove !== undefined) {
    options.autoApprove = autoApprove;
  }

  if (nonInteractive !== undefined) {
    options.nonInteractive = nonInteractive;
  }

  if (tools !== undefined) {
    options.tools = tools;
  }

  if (disabledTools !== undefined) {
    options.disabledTools = disabledTools;
  }

  if (logLevel !== undefined) {
    options.logLevel = logLevel;
  }

  const logFile = parseString(env.EDDIE_CLI_LOG_FILE);
  if (logFile !== undefined) {
    options.logFile = logFile;
  }

  const agentMode = parseString(env.EDDIE_CLI_AGENT_MODE);
  if (agentMode !== undefined) {
    options.agentMode = agentMode;
  }

  if (disableSubagents !== undefined) {
    options.disableSubagents = disableSubagents;
  }

  return options;
}

export function resolveRuntimeOptions(
  moduleOptions?: CliRuntimeOptions,
  env: NodeJS.ProcessEnv = process.env,
): CliRuntimeOptions {
  const envOptions = resolveCliRuntimeOptionsFromEnv(env);
  return {
    ...envOptions,
    ...(moduleOptions ?? {}),
  } satisfies CliRuntimeOptions;
}
