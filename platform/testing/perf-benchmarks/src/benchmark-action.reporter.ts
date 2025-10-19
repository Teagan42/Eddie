import { promises as fs, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

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

  return entries.length > 0 ? Object.fromEntries(entries) as Record<string, number> : undefined;
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
  private reportDir: string | undefined;

  constructor(private readonly options: ReporterOptions = {}) {}

  onInit(ctx: Vitest): void {
    this.ctx = ctx;
    const defaultDir = resolve(ctx.config.root, ".bench-reports");
    this.reportDir = process.env.BENCHMARK_ACTION_REPORT_DIR ?? defaultDir;
    process.env.BENCHMARK_ACTION_REPORT_DIR = this.reportDir;
    mkdirSync(this.reportDir, { recursive: true });
  }

  private resolveOutputTarget(): string | undefined {
    if (!this.ctx) {
      return undefined;
    }

    const outputTarget = process.env.BENCHMARK_OUTPUT_PATH ?? this.options.outputFile;
    if (!outputTarget) {
      return undefined;
    }

    return resolve(this.ctx.config.root, outputTarget);
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
    const structuredEntries = this.collectReportEntries();
    const mergedEntries = [...vitestEntries, ...fallbackEntries, ...structuredEntries];
    const uniqueEntries = Array.from(
      new Map(mergedEntries.map((entry) => [`${entry.name}:${entry.unit}`, entry])).values(),
    );
    await fs.writeFile(resolvedOutput, JSON.stringify(uniqueEntries, null, 2), "utf-8");

    this.ctx.logger?.log?.(`Benchmark action results written to ${resolvedOutput}`);
  }

  private readStructuredReport<T>(filename: string): T | undefined {
    if (!this.reportDir) {
      return undefined;
    }

    try {
      const path = join(this.reportDir, filename);
      return JSON.parse(readFileSync(path, "utf-8")) as T;
    } catch {
      return undefined;
    }
  }

  private collectReportEntries(): BenchmarkActionEntry[] {
    const entries: BenchmarkActionEntry[] = [];

    const templateReport = this.readStructuredReport<{
      scenarios?: Array<{
        label: string;
        warm: { durations: { mean: number; sampleCount: number } };
      }>;
    }>("template-rendering.nunjucks.json");

    for (const scenario of templateReport?.scenarios ?? []) {
      entries.push({
        name: `TemplateRendererService render scenarios › ${scenario.label}`,
        unit: "ms",
        value: scenario.warm.durations.mean,
        extra: { samples: scenario.warm.durations.sampleCount },
      });
    }

    const contextReport = this.readStructuredReport<{
      scenarios?: Array<{
        dataset: { name: string };
        metrics: { meanDurationMs: number };
      }>;
    }>("context-pack.pack.json");

    for (const scenario of contextReport?.scenarios ?? []) {
      entries.push({
        name: `ContextService.pack benchmarks › pack ${scenario.dataset.name}`,
        unit: "ms",
        value: scenario.metrics.meanDurationMs,
      });
    }

    return entries;
  }
}

export default BenchmarkActionReporter;

