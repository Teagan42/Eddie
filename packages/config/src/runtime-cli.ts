import type { CliRuntimeOptions, LogLevel } from "./types";

const LOG_LEVEL_VALUES = new Set<LogLevel>(["silent", "info", "debug"]);

const STRING_OPTION_KEYS = [
  "config",
  "model",
  "provider",
  "jsonlTrace",
  "logFile",
  "agentMode",
] as const;
type StringOptionKey = (typeof STRING_OPTION_KEYS)[number];
const STRING_OPTION_SET = new Set<StringOptionKey>(STRING_OPTION_KEYS);

const LIST_OPTION_KEYS = ["context", "tools", "disabledTools"] as const;
type ListOptionKey = (typeof LIST_OPTION_KEYS)[number];
const LIST_OPTION_SET = new Set<ListOptionKey>(LIST_OPTION_KEYS);

type ValueOptionKey = StringOptionKey | ListOptionKey | "logLevel";

const VALUE_OPTIONS = new Map<string, ValueOptionKey>([
  ["--config", "config"],
  ["-c", "config"],
  ["--context", "context"],
  ["-C", "context"],
  ["--model", "model"],
  ["-m", "model"],
  ["--provider", "provider"],
  ["-p", "provider"],
  ["--tools", "tools"],
  ["-t", "tools"],
  ["--disable-tools", "disabledTools"],
  ["-D", "disabledTools"],
  ["--jsonl-trace", "jsonlTrace"],
  ["--log-level", "logLevel"],
  ["--log-file", "logFile"],
  ["--agent-mode", "agentMode"],
]);

type BooleanOptionKey =
  | "autoApprove"
  | "nonInteractive"
  | "disableSubagents"
  | "disableContext";
const BOOLEAN_OPTIONS = new Map<string, BooleanOptionKey>([
  ["--auto-approve", "autoApprove"],
  ["--auto", "autoApprove"],
  ["--non-interactive", "nonInteractive"],
  ["--disable-subagents", "disableSubagents"],
  ["--no-context", "disableContext"],
]);

function isListOptionKey(key: ValueOptionKey): key is ListOptionKey {
  return LIST_OPTION_SET.has(key as ListOptionKey);
}

function isStringOptionKey(key: ValueOptionKey): key is StringOptionKey {
  return STRING_OPTION_SET.has(key as StringOptionKey);
}

function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVEL_VALUES.has(value as LogLevel);
}

function mergeUniqueList(
  existing: readonly string[] | undefined,
  additions: readonly string[],
): string[] {
  if (additions.length === 0) {
    return existing ? [...existing] : [];
  }

  if (!existing || existing.length === 0) {
    return [...additions];
  }

  const seen = new Set(existing);
  const result = [...existing];

  for (const value of additions) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function normalizeList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeListValues(values: readonly string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function cloneList(
  values: readonly string[] | undefined,
  dedupe: boolean,
  normalize: boolean,
): string[] | undefined {
  if (!values) {
    return undefined;
  }

  const source = normalize ? normalizeListValues(values) : values;

  if (source.length === 0) {
    return [];
  }

  if (!dedupe) {
    return normalize ? [...source] : [...values];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of source) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

export function cloneCliRuntimeOptions(
  options: Partial<CliRuntimeOptions>,
  dedupeLists = false,
  normalizeLists = false,
): CliRuntimeOptions {
  const { context, tools, disabledTools, ...rest } = options;

  return {
    ...rest,
    context: cloneList(context, dedupeLists, normalizeLists),
    tools: cloneList(tools, dedupeLists, normalizeLists),
    disabledTools: cloneList(
      disabledTools,
      dedupeLists,
      normalizeLists,
    ),
  };
}

export function parseCliRuntimeOptionsFromArgv(
  argv: string[],
): CliRuntimeOptions {
  const accumulator: Partial<CliRuntimeOptions> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      break;
    }

    const booleanKey = BOOLEAN_OPTIONS.get(token);
    if (booleanKey) {
      accumulator[booleanKey] = true;
      continue;
    }

    const optionKey = VALUE_OPTIONS.get(token);
    if (!optionKey) {
      continue;
    }

    const next = argv[i + 1];
    if (next === undefined || next.startsWith("-")) {
      continue;
    }

    i += 1;

    if (isListOptionKey(optionKey)) {
      const list = normalizeList(next);
      if (list.length === 0) {
        continue;
      }
      const existing = accumulator[optionKey];
      const merged = mergeUniqueList(existing, list);
      accumulator[optionKey] = merged;
      continue;
    }

    if (optionKey === "logLevel") {
      if (!isLogLevel(next)) {
        continue;
      }
      accumulator.logLevel = next;
      continue;
    }

    if (isStringOptionKey(optionKey)) {
      accumulator[optionKey] = next;
    }
  }

  return cloneCliRuntimeOptions(accumulator);
}

export function mergeCliRuntimeOptions(
  base: CliRuntimeOptions,
  overrides: CliRuntimeOptions,
): CliRuntimeOptions {
  const merged: CliRuntimeOptions = { ...base };

  for (const key of Object.keys(overrides) as (keyof CliRuntimeOptions)[]) {
    const value = overrides[key];
    if (typeof value === "undefined") {
      continue;
    }

    merged[key] = Array.isArray(value) ? [...value] : value;
  }

  return merged;
}
