import type { CliRuntimeOptions } from "@eddie/config";

const VALUE_OPTIONS = new Map<string, keyof CliRuntimeOptions>([
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

const BOOLEAN_OPTIONS = new Map<string, keyof CliRuntimeOptions>([
  ["--auto-approve", "autoApprove"],
  ["--auto", "autoApprove"],
  ["--non-interactive", "nonInteractive"],
  ["--disable-subagents", "disableSubagents"],
  ["--no-context", "disableContext"],
]);

function normalizeList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseRuntimeOptionsFromArgv(argv: string[]): CliRuntimeOptions {
  const accumulator: CliRuntimeOptions = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      break;
    }

    const booleanKey = BOOLEAN_OPTIONS.get(token);
    if (booleanKey) {
      accumulator[booleanKey] = true as CliRuntimeOptions[typeof booleanKey];
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

    if (optionKey === "context" || optionKey === "tools" || optionKey === "disabledTools") {
      const list = normalizeList(next);
      if (list.length === 0) {
        continue;
      }
      const existing = (accumulator[optionKey] as string[] | undefined) ?? [];
      accumulator[optionKey] = [...existing, ...list] as CliRuntimeOptions[typeof optionKey];
      continue;
    }

    accumulator[optionKey] = next as CliRuntimeOptions[typeof optionKey];
  }

  return cloneOptions(accumulator);
}

function cloneOptions(options: CliRuntimeOptions): CliRuntimeOptions {
  return {
    ...options,
    context: options.context ? [...options.context] : undefined,
    tools: options.tools ? [...options.tools] : undefined,
    disabledTools: options.disabledTools ? [...options.disabledTools] : undefined,
  };
}

let cachedOptions: CliRuntimeOptions | null = null;

export function getRuntimeOptions(): CliRuntimeOptions {
  if (!cachedOptions) {
    cachedOptions = parseRuntimeOptionsFromArgv(process.argv.slice(2));
  }

  return cloneOptions(cachedOptions);
}

export function resetRuntimeOptionsCache(): void {
  cachedOptions = null;
}
