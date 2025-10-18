import { describe, expect, it } from "vitest";

import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ReporterModule, {
  BenchmarkActionReporter,
  buildBenchmarkEntries,
} from "../src/benchmark-action.reporter";
import {
  drainBenchmarkActionEntries,
  registerBenchmarkActionEntry,
} from "../src/benchmark-action.registry";

describe("buildBenchmarkEntries", () => {
  it("converts vitest benchmark stats into benchmark-action entries", () => {
    const files = [
      {
        filepath: "/workspace/foo.bench.ts",
        tasks: [
          {
            type: "suite",
            name: "Context pack",
            tasks: [
              {
                type: "test",
                name: "pack small",
                meta: { benchmark: true },
                result: {
                  state: "pass",
                  benchmark: {
                    name: "pack small",
                    mean: 4.3219,
                    min: 3.8,
                    max: 4.9,
                    hz: 112.5,
                    sampleCount: 42,
                    rme: 1.3,
                    rank: 1,
                  },
                },
              },
              {
                type: "test",
                name: "pack large",
                meta: { benchmark: true },
                result: {
                  state: "pass",
                  benchmark: {
                    name: "pack large",
                    mean: 12.126,
                    min: 11.4,
                    max: 12.9,
                    hz: 82.7,
                    sampleCount: 40,
                    rme: 2.1,
                    rank: 2,
                  },
                },
              },
              {
                type: "test",
                name: "non benchmark",
                meta: {},
              },
            ],
            result: { state: "pass" },
          },
        ],
      },
    ];

    const entries = buildBenchmarkEntries(files as never);

    expect(entries).toEqual([
      {
        name: "Context pack › pack small",
        unit: "ms",
        value: 4321.9,
        extra: {
          hz: 112.5,
          min: 3.8,
          max: 4.9,
          rank: 1,
          rme: 1.3,
          samples: 42,
        },
      },
      {
        name: "Context pack › pack large",
        unit: "ms",
        value: 12126,
        extra: {
          hz: 82.7,
          min: 11.4,
          max: 12.9,
          rank: 2,
          rme: 2.1,
          samples: 40,
        },
      },
    ]);
  });

  it("skips vitest benchmark stats that produce non-finite means", () => {
    const files = [
      {
        filepath: "/workspace/foo.bench.ts",
        tasks: [
          {
            type: "suite",
            name: "Context pack",
            tasks: [
              {
                type: "test",
                name: "pack small",
                meta: { benchmark: true },
                result: {
                  state: "pass",
                  benchmark: {
                    name: "pack small",
                    mean: Number.NaN,
                  },
                },
              },
              {
                type: "test",
                name: "pack medium",
                meta: { benchmark: true },
                result: {
                  state: "pass",
                  benchmark: {
                    name: "pack medium",
                    mean: Number.POSITIVE_INFINITY,
                  },
                },
              },
              {
                type: "test",
                name: "pack large",
                meta: { benchmark: true },
                result: {
                  state: "pass",
                  benchmark: {
                    name: "pack large",
                    mean: 1.234,
                  },
                },
              },
            ],
            result: { state: "pass" },
          },
        ],
      },
    ];

    const entries = buildBenchmarkEntries(files as never);

    expect(entries).toEqual([
      {
        name: "Context pack › pack large",
        unit: "ms",
        value: 1234,
      },
    ]);
  });

  it("writes benchmark results to the BENCHMARK_OUTPUT_PATH when finishing", async () => {
    const files = [
      {
        filepath: "/workspace/foo.bench.ts",
        tasks: [
          {
            type: "suite",
            name: "Renderer",
            tasks: [
              {
                type: "test",
                name: "render inline",
                meta: { benchmark: true },
                result: {
                  state: "pass",
                  benchmark: {
                    name: "render inline",
                    mean: 8.6159,
                    min: 8.2,
                    max: 9.1,
                    hz: 143.2,
                    sampleCount: 30,
                    rme: 2.9,
                    rank: 1,
                  },
                },
              },
            ],
            result: { state: "pass" },
          },
        ],
      },
    ];

    const tmpRoot = mkdtempSync(join(tmpdir(), "bench-reporter-"));
    const targetPath = join(tmpRoot, "benchmark-results.json");
    const reporter = new BenchmarkActionReporter({ outputFile: "fallback.json" });
    const ctx = {
      config: { root: tmpRoot },
      logger: { log: () => {}, warn: () => {} },
      state: { getFiles: () => files },
    } as const;

    process.env.BENCHMARK_OUTPUT_PATH = targetPath;
    reporter.onInit(ctx as never);
    await reporter.onFinished(files as never);

    const written = JSON.parse(readFileSync(targetPath, "utf-8"));
    expect(written).toEqual([
      {
        name: "Renderer › render inline",
        unit: "ms",
        value: 8615.9,
        extra: {
          hz: 143.2,
          min: 8.2,
          max: 9.1,
          rank: 1,
          rme: 2.9,
          samples: 30,
        },
      },
    ]);

    delete process.env.BENCHMARK_OUTPUT_PATH;
  });

  it("falls back to registered entries when vitest stats omit benchmark samples", async () => {
    const files = [
      {
        filepath: "/workspace/foo.bench.ts",
        tasks: [
          {
            type: "suite",
            name: "Context pack",
            tasks: [
              {
                type: "test",
                name: "pack small",
                meta: { benchmark: true },
                result: {
                  state: "run",
                  benchmark: {
                    name: "pack small",
                    samples: [],
                    rank: 1,
                    rme: 0,
                  },
                },
              },
            ],
            result: { state: "run" },
          },
        ],
      },
    ];

    const tmpRoot = mkdtempSync(join(tmpdir(), "bench-reporter-"));
    const targetPath = join(tmpRoot, "benchmark-results.json");
    const reporter = new BenchmarkActionReporter({ outputFile: "fallback.json" });
    const ctx = {
      config: { root: tmpRoot },
      logger: { log: () => {}, warn: () => {} },
      state: { getFiles: () => files },
    } as const;

    drainBenchmarkActionEntries();
    registerBenchmarkActionEntry({
      name: "Context pack › pack small",
      unit: "ms",
      value: 123.456,
    });

    process.env.BENCHMARK_OUTPUT_PATH = targetPath;

    reporter.onInit(ctx as never);
    await reporter.onFinished(files as never);

    const written = JSON.parse(readFileSync(targetPath, "utf-8"));
    expect(written).toEqual([
      {
        name: "Context pack › pack small",
        unit: "ms",
        value: 123.456,
      },
    ]);

    delete process.env.BENCHMARK_OUTPUT_PATH;
  });

  it("resolves BENCHMARK_OUTPUT_PATH relative to INIT_CWD when provided", async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), "bench-reporter-"));
    const workspaceRoot = join(tmpRoot, "platform", "testing", "perf-benchmarks");
    mkdirSync(workspaceRoot, { recursive: true });
    const relativePath = join(
      "platform",
      "testing",
      "perf-benchmarks",
      "benchmark-results.json"
    );

    const reporter = new BenchmarkActionReporter();
    const ctx = {
      config: { root: workspaceRoot },
      logger: { log: () => {}, warn: () => {} },
      state: { getFiles: () => [] },
    } as const;

    process.env.INIT_CWD = tmpRoot;
    process.env.BENCHMARK_OUTPUT_PATH = relativePath;

    reporter.onInit(ctx as never);
    await reporter.onFinished([] as never);

    const targetPath = join(workspaceRoot, "benchmark-results.json");
    expect(readFileSync(targetPath, "utf-8")).toBe("[]");

    delete process.env.BENCHMARK_OUTPUT_PATH;
    delete process.env.INIT_CWD;
  });

  it("exposes the reporter class as the default export", () => {
    expect(ReporterModule).toBe(BenchmarkActionReporter);
  });
});

