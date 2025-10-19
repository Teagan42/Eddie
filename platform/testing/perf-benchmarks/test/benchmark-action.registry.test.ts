import { describe, expect, it, vi } from "vitest";

import { BroadcastChannel } from "node:worker_threads";

import {
  drainBenchmarkActionEntries,
  registerBenchmarkActionEntry,
} from "../src/benchmark-action.registry";

describe("benchmark action registry", () => {
  it("stores entries registered in the current context", () => {
    drainBenchmarkActionEntries();

    registerBenchmarkActionEntry({
      name: "local entry",
      unit: "ms",
      value: 12.34,
    });

    expect(drainBenchmarkActionEntries()).toEqual([
      { name: "local entry", unit: "ms", value: 12.34 },
    ]);
  });

  it("captures entries broadcast from other contexts", async () => {
    if (typeof BroadcastChannel !== "function") {
      return;
    }

    drainBenchmarkActionEntries();

    const channel = new BroadcastChannel("eddie.benchmarkActionEntries");
    channel.postMessage({
      type: "register",
      entry: { name: "broadcast entry", unit: "ms", value: 56.78 },
    });

    let capturedEntries: ReturnType<typeof drainBenchmarkActionEntries> = [];
    await vi.waitUntil(() => {
      const entries = drainBenchmarkActionEntries();
      if (entries.length === 0) {
        return false;
      }

      capturedEntries = entries;
      return true;
    });

    channel.close();

    expect(capturedEntries).toEqual([
      { name: "broadcast entry", unit: "ms", value: 56.78 },
    ]);
  });
});
