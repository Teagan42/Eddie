import {
  CLI_BOOLEAN_OPTIONS_BY_FLAG,
  CLI_LOG_LEVEL_VALUES,
  CLI_VALUE_OPTIONS_BY_FLAG,
  isCliListOption,
  isCliLogLevelOption,
  isCliStringOption,
} from "./runtime-cli-options";
import type { CliRuntimeOptions, LogLevel } from "./types";

export const METRICS_BACKEND_VALUES = new Set<
  NonNullable<CliRuntimeOptions["metricsBackend"]>
>(["logging", "noop"]);

export const METRICS_LOGGING_LEVEL_VALUES = new Set<
  NonNullable<CliRuntimeOptions["metricsLoggingLevel"]>
>(["debug", "log", "verbose"]);

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

    const booleanDefinition = CLI_BOOLEAN_OPTIONS_BY_FLAG.get(token);
    if (booleanDefinition) {
      accumulator[booleanDefinition.runtimeKey] = true;
      continue;
    }

    const optionDefinition = CLI_VALUE_OPTIONS_BY_FLAG.get(token);
    if (!optionDefinition) {
      continue;
    }

    const next = argv[i + 1];
    if (next === undefined || next.startsWith("-")) {
      continue;
    }

    i += 1;

    if (isCliListOption(optionDefinition)) {
      const list = normalizeList(next);
      if (list.length === 0) {
        continue;
      }
      const existing = accumulator[
        optionDefinition.runtimeKey
      ] as CliRuntimeOptions[typeof optionDefinition.runtimeKey];
      const merged = mergeUniqueList(existing, list);
      accumulator[optionDefinition.runtimeKey] = merged;
      continue;
    }

    if (isCliLogLevelOption(optionDefinition)) {
      if (!CLI_LOG_LEVEL_VALUES.has(next as LogLevel)) {
        continue;
      }
      accumulator.logLevel = next as CliRuntimeOptions["logLevel"];
      continue;
    }

    if (isCliStringOption(optionDefinition)) {
      if (optionDefinition.runtimeKey === "metricsBackend") {
        if (METRICS_BACKEND_VALUES.has(next as typeof accumulator.metricsBackend)) {
          accumulator.metricsBackend =
            next as CliRuntimeOptions["metricsBackend"];
        }
        continue;
      }

      if (optionDefinition.runtimeKey === "metricsLoggingLevel") {
        if (
          METRICS_LOGGING_LEVEL_VALUES.has(
            next as typeof accumulator.metricsLoggingLevel,
          )
        ) {
          accumulator.metricsLoggingLevel =
            next as CliRuntimeOptions["metricsLoggingLevel"];
        }
        continue;
      }

      accumulator[optionDefinition.runtimeKey] = next as CliRuntimeOptions[
        typeof optionDefinition.runtimeKey
      ];
    }
  }

  return cloneCliRuntimeOptions(accumulator);
}

export function mergeCliRuntimeOptions(
  base: CliRuntimeOptions,
  overrides: CliRuntimeOptions,
): CliRuntimeOptions {
  const merged = cloneCliRuntimeOptions(base);
  const overrideClone = cloneCliRuntimeOptions(overrides);
  const target =
    merged as Record<
      keyof CliRuntimeOptions,
      CliRuntimeOptions[keyof CliRuntimeOptions]
    >;
  const source =
    overrideClone as Record<
      keyof CliRuntimeOptions,
      CliRuntimeOptions[keyof CliRuntimeOptions]
    >;

  for (const key of Object.keys(source) as (keyof CliRuntimeOptions)[]) {
    const value = source[key];
    if (typeof value === "undefined") {
      continue;
    }

    target[key] = value;
  }

  return merged;
}
