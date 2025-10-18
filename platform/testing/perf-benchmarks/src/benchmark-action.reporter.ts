import { promises as fs } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import type { Reporter, Vitest } from "vitest";

import { drainBenchmarkActionEntries } from "./benchmark-action.registry";

export interface BenchmarkActionEntry {
  readonly name: string;
  readonly unit: string;
  readonly value: number;
  readonly extra?: Record<string, unknown>;
}

interface BenchmarkStats {
  readonly name: string;
  readonly mean: number;
  readonly min?: number;
  readonly max?: number;
  readonly hz?: number;
  readonly rme?: number;
  readonly rank?: number;
  readonly sampleCount?: number;
}

interface BenchmarkTaskLike {
  readonly type?: string;
  readonly name?: string;
  readonly meta?: { readonly benchmark?: boolean };
  readonly result?: {
    readonly benchmark?: BenchmarkStats;
  };
}

interface SuiteTaskLike {
  readonly type?: string;
  readonly name?: string;
  readonly tasks?: readonly BenchmarkTaskLike[];
}

interface FileTaskLike {
  readonly tasks?: readonly SuiteTaskLike[];
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

interface ReporterOptions {
  readonly outputFile?: string;
}

const DEFAULT_OUTPUT_FILE = "benchmark-results.json";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const buildExtras = (stats: BenchmarkStats): Record<string, number> | undefined => {
  const entries = Object.entries({
    hz: stats.hz,
    min: stats.min,
    max: stats.max,
    rank: stats.rank,
    rme: stats.rme,
    samples: stats.sampleCount,
  }).filter(([, value]) => isFiniteNumber(value));

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export function buildBenchmarkEntries(files: readonly FileTaskLike[]): BenchmarkActionEntry[] {
  const entries: BenchmarkActionEntry[] = [];

  for (const file of files) {
    for (const suite of file.tasks ?? []) {
      if (suite?.type !== "suite" || !suite.tasks) {
        continue;
      }

      for (const task of suite.tasks) {
        if (!task?.meta?.benchmark) {
          continue;
        }

        const stats = task.result?.benchmark;
        if (!stats || !isFiniteNumber(stats.mean)) {
          continue;
        }

        const name = [suite.name, stats.name ?? task.name]
          .filter((segment): segment is string => Boolean(segment && segment.length > 0))
          .join(" › ");

        const meanInMilliseconds = stats.mean * 1000;

        entries.push({
          name,
          unit: "ms",
          value: round(meanInMilliseconds),
          extra: buildExtras(stats),
        });
      }
    }
  }

  return entries;
}

export class BenchmarkActionReporter implements Reporter {
  private ctx: Vitest | undefined;

  constructor(private readonly options: ReporterOptions = {}) {}

  onInit(ctx: Vitest): void {
    this.ctx = ctx;
  }

  private resolveOutputTarget(): string | undefined {
    if (!this.ctx) {
      return undefined;
    }

    const configuredTarget =
      process.env.BENCHMARK_OUTPUT_PATH ??
      this.options.outputFile ??
      DEFAULT_OUTPUT_FILE;

    if (isAbsolute(configuredTarget)) {
      return configuredTarget;
    }

    const baseDir = this.ctx.config.workspaceRoot ?? this.ctx.config.root;
    return resolve(baseDir, configuredTarget);
  }

  async onFinished(files?: readonly FileTaskLike[]): Promise<void> {
    if (!this.ctx) {
      return;
    }

    const resolvedOutput = this.resolveOutputTarget();
    if (!resolvedOutput) {
      this.ctx.logger?.warn?.("BenchmarkActionReporter: no output file configured; skipping export");
      return;
    }

    const directory = dirname(resolvedOutput);
    await fs.mkdir(directory, { recursive: true });

    const sourceFiles = (files ?? this.ctx.state.getFiles()) as readonly FileTaskLike[];
    const vitestEntries = buildBenchmarkEntries(sourceFiles);
    const fallbackEntries = drainBenchmarkActionEntries();
    const entries = vitestEntries.length > 0 ? vitestEntries : fallbackEntries;
    await fs.writeFile(resolvedOutput, JSON.stringify(entries, null, 2), "utf-8");

    this.ctx.logger?.log?.(`Benchmark action results written to ${resolvedOutput}`);
  }
}

export default BenchmarkActionReporter;

