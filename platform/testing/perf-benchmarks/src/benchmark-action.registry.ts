import { BroadcastChannel, type MessageEvent } from "node:worker_threads";

import type { BenchmarkActionEntry } from "./benchmark-action.reporter";

interface BenchmarkRegistryMessage {
  readonly type: "register";
  readonly entry: BenchmarkActionEntry;
}

const BENCHMARK_ACTION_CHANNEL = "eddie.benchmarkActionEntries";

const registry: { readonly entries: BenchmarkActionEntry[] } = { entries: [] };

function upsertEntry(entry: BenchmarkActionEntry): void {
  const existingIndex = registry.entries.findIndex((candidate) => candidate.name === entry.name);

  if (existingIndex >= 0) {
    registry.entries.splice(existingIndex, 1, entry);
    return;
  }

  registry.entries.push(entry);
}

let broadcastChannel: BroadcastChannel | undefined;

try {
  broadcastChannel = new BroadcastChannel(BENCHMARK_ACTION_CHANNEL);
  broadcastChannel.onmessage = (event: MessageEvent) => {
    const message = event.data as BenchmarkRegistryMessage | undefined;
    if (!message || message.type !== "register") {
      return;
    }

    upsertEntry(message.entry);
  };
} catch {
  // Ignore environments where BroadcastChannel is unavailable (e.g. Node < 15).
}

export function registerBenchmarkActionEntry(entry: BenchmarkActionEntry): void {
  upsertEntry(entry);
  broadcastChannel?.postMessage({ type: "register", entry });
}

export function drainBenchmarkActionEntries(): BenchmarkActionEntry[] {
  if (registry.entries.length === 0) {
    return [];
  }

  const entries = [...registry.entries];
  registry.entries.length = 0;
  return entries;
}
