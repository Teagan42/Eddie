import type { ContextPackDataset } from './context-pack.fixtures';

export interface PackMetrics {
  readonly datasetName: string;
  readonly durationMs: number;
  readonly filesPerSecond: number;
  readonly bytesPerSecond: number;
  readonly bundleBytes: number;
}

export interface PackMetricsInput {
  readonly dataset: ContextPackDataset;
  readonly durationMs: number;
}

export interface AggregatePackMetricsInput {
  readonly dataset: ContextPackDataset;
  readonly durationsMs: readonly number[];
}

export interface AggregatedPackMetrics extends PackMetrics {
  readonly iterations: number;
  readonly meanDurationMs: number;
  readonly minDurationMs: number;
  readonly maxDurationMs: number;
}

const MILLISECONDS_PER_SECOND = 1000;

function summarizeDurations(durationsMs: readonly number[]): {
  iterations: number;
  minDurationMs: number;
  maxDurationMs: number;
  totalDurationMs: number;
} {
  const iterations = durationsMs.length;
  let minDurationMs = Number.POSITIVE_INFINITY;
  let maxDurationMs = Number.NEGATIVE_INFINITY;
  let totalDurationMs = 0;

  for (const value of durationsMs) {
    if (value < minDurationMs) {
      minDurationMs = value;
    }
    if (value > maxDurationMs) {
      maxDurationMs = value;
    }
    totalDurationMs += value;
  }

  return { iterations, minDurationMs, maxDurationMs, totalDurationMs };
}

export function computePackMetrics({ dataset, durationMs }: PackMetricsInput): PackMetrics {
  const effectiveDurationMs = durationMs > 0 ? durationMs : Number.EPSILON;
  const seconds = effectiveDurationMs / MILLISECONDS_PER_SECOND;
  const filesPerSecond = dataset.fileCount / seconds;
  const bytesPerSecond = dataset.totalBytes / seconds;
  const bundleBytes = dataset.resourceBundles.reduce((total, bundle) => total + bundle.bytes, 0);

  return {
    datasetName: dataset.name,
    durationMs,
    filesPerSecond,
    bytesPerSecond,
    bundleBytes,
  };
}

export function aggregatePackMetrics({ dataset, durationsMs }: AggregatePackMetricsInput): AggregatedPackMetrics {
  if (!durationsMs.length) {
    throw new Error('Cannot aggregate metrics without at least one duration sample.');
  }

  const { iterations, minDurationMs, maxDurationMs, totalDurationMs } = summarizeDurations(durationsMs);
  const meanDurationMs = totalDurationMs / iterations;
  const metrics = computePackMetrics({ dataset, durationMs: meanDurationMs });

  return {
    ...metrics,
    iterations,
    meanDurationMs,
    minDurationMs,
    maxDurationMs,
  };
}
