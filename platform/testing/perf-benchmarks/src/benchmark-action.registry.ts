import type { BenchmarkActionEntry } from "./benchmark-action.reporter";

const BENCHMARK_ACTION_REGISTRY_SYMBOL = Symbol.for("eddie.benchmarkActionEntries");

type GlobalBenchmarkRegistry = typeof globalThis & {
  [BENCHMARK_ACTION_REGISTRY_SYMBOL]?: BenchmarkActionRegistry;
};

interface BenchmarkActionRegistry {
  entries: BenchmarkActionEntry[];
}

function getGlobalRegistry(): BenchmarkActionRegistry | undefined {
  return (globalThis as GlobalBenchmarkRegistry)[BENCHMARK_ACTION_REGISTRY_SYMBOL];
}

function ensureGlobalRegistry(): BenchmarkActionRegistry {
  const globalScope = globalThis as GlobalBenchmarkRegistry;
  const existing = globalScope[BENCHMARK_ACTION_REGISTRY_SYMBOL];
  if (existing) {
    return existing;
  }

  const created: BenchmarkActionRegistry = { entries: [] };
  globalScope[BENCHMARK_ACTION_REGISTRY_SYMBOL] = created;
  return created;
}

export function registerBenchmarkActionEntry(entry: BenchmarkActionEntry): void {
  const registry = ensureGlobalRegistry();
  registry.entries.push(entry);
}

export function drainBenchmarkActionEntries(): BenchmarkActionEntry[] {
  const registry = getGlobalRegistry();
  if (!registry || registry.entries.length === 0) {
    return [];
  }

  const entries = [...registry.entries];
  registry.entries.length = 0;
  return entries;
}
