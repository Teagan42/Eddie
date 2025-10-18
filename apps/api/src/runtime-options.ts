import type { CliRuntimeOptions } from "@eddie/config";
import {
  cloneCliRuntimeOptions,
  parseCliRuntimeOptionsFromArgv,
} from "@eddie/config";

const RUNTIME_OPTIONS_CACHE_KEY = Symbol.for("eddie.api.runtimeOptions");

type RuntimeOptionsGlobalState = {
  [RUNTIME_OPTIONS_CACHE_KEY]?: CliRuntimeOptions | null;
};

function runtimeOptionsStore(): typeof globalThis & RuntimeOptionsGlobalState {
  return globalThis as typeof globalThis & RuntimeOptionsGlobalState;
}

function readCachedOptions(): CliRuntimeOptions | null {
  return runtimeOptionsStore()[RUNTIME_OPTIONS_CACHE_KEY] ?? null;
}

function writeCachedOptions(options: CliRuntimeOptions | null): void {
  runtimeOptionsStore()[RUNTIME_OPTIONS_CACHE_KEY] = options;
}

function cacheOptions(options: CliRuntimeOptions): void {
  writeCachedOptions(cloneCliRuntimeOptions(options, true, true));
}

export function setRuntimeOptions(options: CliRuntimeOptions): void {
  cacheOptions(options);
}

export function setRuntimeOptionsFromArgv(argv: string[]): void {
  cacheOptions(parseRuntimeOptionsFromArgv(argv));
}

export function parseRuntimeOptionsFromArgv(
  argv: string[],
): CliRuntimeOptions {
  return cloneCliRuntimeOptions(parseCliRuntimeOptionsFromArgv(argv));
}

export function getRuntimeOptions(): CliRuntimeOptions {
  const cachedOptions = readCachedOptions();
  if (!cachedOptions) {
    return {};
  }

  return cloneCliRuntimeOptions(cachedOptions);
}

export function resetRuntimeOptionsCache(): void {
  writeCachedOptions(null);
}
