import type { CliRuntimeOptions, LogLevel } from "@eddie/config";

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

const BOOLEAN_OPTION_KEYS = [
  "autoApprove",
  "nonInteractive",
  "disableSubagents",
  "disableContext",
] as const;
type BooleanOptionKey = (typeof BOOLEAN_OPTION_KEYS)[number];
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

export function parseRuntimeOptionsFromArgv(argv: string[]): CliRuntimeOptions {
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

  return cloneOptions(accumulator);
}

function cloneOptions(options: Partial<CliRuntimeOptions>): CliRuntimeOptions {
  const { context, tools, disabledTools, ...rest } = options;

  return {
    ...rest,
    context: context ? [...context] : undefined,
    tools: tools ? [...tools] : undefined,
    disabledTools: disabledTools ? [...disabledTools] : undefined,
  };
}

let cachedOptions: CliRuntimeOptions | null = null;

function cacheOptions(options: CliRuntimeOptions): void {
  cachedOptions = cloneOptions(options);
}

export function setRuntimeOptions(options: CliRuntimeOptions): void {
  cacheOptions(options);
}

export function setRuntimeOptionsFromArgv(argv: string[]): void {
  cacheOptions(parseRuntimeOptionsFromArgv(argv));
}

export function getRuntimeOptions(): CliRuntimeOptions {
  if (!cachedOptions) {
    return {};
  }

  return cloneOptions(cachedOptions);
}

export function resetRuntimeOptionsCache(): void {
  cachedOptions = null;
}
