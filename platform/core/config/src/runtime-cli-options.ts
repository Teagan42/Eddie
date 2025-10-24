import type { CliRuntimeOptions, LogLevel } from "./types";

const LOG_LEVEL_VALUES = ["silent", "info", "debug"] as const satisfies readonly LogLevel[];

export const CLI_LOG_LEVEL_VALUES = new Set<LogLevel>(LOG_LEVEL_VALUES);

type CliStringOptionKey =
  | "config"
  | "preset"
  | "model"
  | "provider"
  | "jsonlTrace"
  | "logFile"
  | "agentMode"
  | "mem0ApiKey"
  | "mem0Host"
  | "metricsBackend"
  | "metricsLoggingLevel";

type CliListOptionKey = "context" | "tools" | "disabledTools";

type CliLogLevelOptionKey = "logLevel";

export type CliValueOptionRuntimeKey =
  | CliStringOptionKey
  | CliListOptionKey
  | CliLogLevelOptionKey;

export interface CliValueOptionDefinitionBase<
  RuntimeKey extends CliValueOptionRuntimeKey,
> {
  readonly runtimeKey: RuntimeKey;
  readonly keys: readonly string[];
}

export interface CliStringValueOptionDefinition
  extends CliValueOptionDefinitionBase<CliStringOptionKey> {
  readonly valueType: "string";
}

export interface CliListValueOptionDefinition
  extends CliValueOptionDefinitionBase<CliListOptionKey> {
  readonly valueType: "list";
}

export interface CliLogLevelValueOptionDefinition
  extends CliValueOptionDefinitionBase<CliLogLevelOptionKey> {
  readonly valueType: "logLevel";
  readonly allowedValues: readonly LogLevel[];
}

export type CliValueOptionDefinition =
  | CliStringValueOptionDefinition
  | CliListValueOptionDefinition
  | CliLogLevelValueOptionDefinition;

type BooleanPropertyNames<T> = {
  [Key in keyof T]-?: Exclude<T[Key], undefined> extends boolean ? Key : never;
}[keyof T];

export type CliBooleanOptionRuntimeKey = Extract<
  BooleanPropertyNames<CliRuntimeOptions>,
  string
>;

export interface CliBooleanOptionDefinition {
  readonly runtimeKey: CliBooleanOptionRuntimeKey;
  readonly keys: readonly string[];
}

export const CLI_VALUE_OPTION_DEFINITIONS: readonly CliValueOptionDefinition[] = [
  {
    runtimeKey: "config",
    keys: ["--config", "-c"],
    valueType: "string",
  },
  {
    runtimeKey: "preset",
    keys: ["--preset"],
    valueType: "string",
  },
  {
    runtimeKey: "context",
    keys: ["--context", "-C"],
    valueType: "list",
  },
  {
    runtimeKey: "model",
    keys: ["--model", "-m"],
    valueType: "string",
  },
  {
    runtimeKey: "provider",
    keys: ["--provider", "-p"],
    valueType: "string",
  },
  {
    runtimeKey: "tools",
    keys: ["--tools", "-t"],
    valueType: "list",
  },
  {
    runtimeKey: "disabledTools",
    keys: ["--disable-tools", "-D"],
    valueType: "list",
  },
  {
    runtimeKey: "jsonlTrace",
    keys: ["--jsonl-trace"],
    valueType: "string",
  },
  {
    runtimeKey: "mem0ApiKey",
    keys: ["--mem0-api-key"],
    valueType: "string",
  },
  {
    runtimeKey: "mem0Host",
    keys: ["--mem0-host"],
    valueType: "string",
  },
  {
    runtimeKey: "logLevel",
    keys: ["--log-level"],
    valueType: "logLevel",
    allowedValues: LOG_LEVEL_VALUES,
  },
  {
    runtimeKey: "logFile",
    keys: ["--log-file"],
    valueType: "string",
  },
  {
    runtimeKey: "agentMode",
    keys: ["--agent-mode"],
    valueType: "string",
  },
  {
    runtimeKey: "metricsBackend",
    keys: ["--metrics-backend"],
    valueType: "string",
  },
  {
    runtimeKey: "metricsLoggingLevel",
    keys: ["--metrics-backend-level"],
    valueType: "string",
  },
] satisfies readonly CliValueOptionDefinition[];

export const CLI_BOOLEAN_OPTION_DEFINITIONS: readonly CliBooleanOptionDefinition[] = [
  {
    runtimeKey: "autoApprove",
    keys: ["--auto-approve", "--auto"],
  },
  {
    runtimeKey: "nonInteractive",
    keys: ["--non-interactive"],
  },
  {
    runtimeKey: "disableSubagents",
    keys: ["--disable-subagents"],
  },
  {
    runtimeKey: "disableContext",
    keys: ["--no-context"],
  },
] satisfies readonly CliBooleanOptionDefinition[];

export const CLI_VALUE_OPTIONS_BY_FLAG = new Map<
  string,
  CliValueOptionDefinition
>(
  CLI_VALUE_OPTION_DEFINITIONS.flatMap((definition) =>
    definition.keys.map((key) => [key, definition] as const),
  ),
);

export const CLI_BOOLEAN_OPTIONS_BY_FLAG = new Map<
  string,
  CliBooleanOptionDefinition
>(
  CLI_BOOLEAN_OPTION_DEFINITIONS.flatMap((definition) =>
    definition.keys.map((key) => [key, definition] as const),
  ),
);

export function isCliListOption(
  definition: CliValueOptionDefinition,
): definition is CliListValueOptionDefinition {
  return definition.valueType === "list";
}

export function isCliStringOption(
  definition: CliValueOptionDefinition,
): definition is CliStringValueOptionDefinition {
  return definition.valueType === "string";
}

export function isCliLogLevelOption(
  definition: CliValueOptionDefinition,
): definition is CliLogLevelValueOptionDefinition {
  return definition.valueType === "logLevel";
}
