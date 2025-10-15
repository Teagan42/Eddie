import type { ContextPackDataset } from './context-pack.fixtures';
import type { AggregatedPackMetrics } from './context-pack.metrics';

export interface StructuredReportScenario {
  readonly dataset: {
    readonly name: string;
    readonly description: string;
    readonly fileCount: number;
    readonly totalBytes: number;
    readonly bundleBytes: number;
    readonly resourceBundles: readonly {
      readonly name: string;
      readonly path: string;
      readonly bytes: number;
    }[];
  };
  readonly metrics: {
    readonly iterations: number;
    readonly meanDurationMs: number;
    readonly minDurationMs: number;
    readonly maxDurationMs: number;
    readonly filesPerSecond: number;
    readonly bytesPerSecond: number;
    readonly durationMs: number;
    readonly bundleBytes: number;
  };
}

export interface StructuredReport {
  readonly benchmark: string;
  readonly createdAt: string;
  readonly environment: Record<string, unknown>;
  readonly scenarios: readonly StructuredReportScenario[];
}

export interface StructuredReportOptions {
  readonly benchmarkName: string;
  readonly scenarios: ReadonlyArray<{
    readonly dataset: ContextPackDataset;
    readonly metrics: AggregatedPackMetrics;
  }>;
  readonly environment?: Record<string, unknown>;
}

function normalizeScenario(dataset: ContextPackDataset, metrics: AggregatedPackMetrics): StructuredReportScenario {
  return {
    dataset: {
      name: dataset.name,
      description: dataset.description,
      fileCount: dataset.fileCount,
      totalBytes: dataset.totalBytes,
      bundleBytes: metrics.bundleBytes,
      resourceBundles: dataset.resourceBundles.map((bundle) => ({
        name: bundle.name,
        path: bundle.path,
        bytes: bundle.bytes,
      })),
    },
    metrics: {
      iterations: metrics.iterations,
      meanDurationMs: metrics.meanDurationMs,
      minDurationMs: metrics.minDurationMs,
      maxDurationMs: metrics.maxDurationMs,
      filesPerSecond: metrics.filesPerSecond,
      bytesPerSecond: metrics.bytesPerSecond,
      durationMs: metrics.durationMs,
      bundleBytes: metrics.bundleBytes,
    },
  };
}

export function createStructuredReport(options: StructuredReportOptions): StructuredReport {
  const timestamp = new Date().toISOString();
  const defaultEnvironment = {
    node: process.version,
    platform: process.platform,
  };
  const mergedEnvironment = { ...defaultEnvironment, ...(options.environment ?? {}) };

  const scenarios: StructuredReportScenario[] = options.scenarios.map(({ dataset, metrics }) =>
    normalizeScenario(dataset, metrics),
  );

  return {
    benchmark: options.benchmarkName,
    createdAt: timestamp,
    environment: mergedEnvironment,
    scenarios,
  };
}
