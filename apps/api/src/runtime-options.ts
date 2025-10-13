import type { CliRuntimeOptions } from "@eddie/config";
import {
  cloneCliRuntimeOptions,
  parseCliRuntimeOptionsFromArgv,
} from "@eddie/config";

let cachedOptions: CliRuntimeOptions | null = null;

function cacheOptions(options: CliRuntimeOptions): void {
  cachedOptions = cloneCliRuntimeOptions(options, true, true);
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
  if (!cachedOptions) {
    return {};
  }

  return cloneCliRuntimeOptions(cachedOptions);
}

export function resetRuntimeOptionsCache(): void {
  cachedOptions = null;
}
