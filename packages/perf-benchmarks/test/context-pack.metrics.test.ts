import { describe, expect, it } from 'vitest';

import type { ContextPackDataset } from '../src/context-pack.fixtures';
import { aggregatePackMetrics, computePackMetrics } from '../src/context-pack.metrics';

describe('computePackMetrics', () => {
  const dataset: ContextPackDataset = {
    name: 'sample',
    description: 'Sample dataset',
    root: '/tmp/sample',
    fileCount: 10,
    totalBytes: 10 * 1024,
    resourceBundles: [
      {
        name: 'assets.tar',
        path: '/tmp/bundles/assets.tar',
        bytes: 2 * 1024,
      },
    ],
  };

  it('derives throughput values from duration and dataset metadata', () => {
    const result = computePackMetrics({ dataset, durationMs: 250 });

    expect(result.datasetName).toBe(dataset.name);
    expect(result.durationMs).toBe(250);
    expect(result.filesPerSecond).toBeCloseTo(40, 5);
    expect(result.bytesPerSecond).toBeCloseTo(40 * 1024, 5);
    expect(result.bundleBytes).toBe(2 * 1024);
  });
});

describe('aggregatePackMetrics', () => {
  const dataset: ContextPackDataset = {
    name: 'aggregate',
    description: 'Aggregate dataset',
    root: '/tmp/aggregate',
    fileCount: 4,
    totalBytes: 4 * 1024,
    resourceBundles: [],
  };

  it('summarizes multiple durations into throughput metrics', () => {
    const durations = [80, 100, 120];
    const summary = aggregatePackMetrics({ dataset, durationsMs: durations });

    expect(summary.iterations).toBe(3);
    expect(summary.meanDurationMs).toBeCloseTo(100, 5);
    expect(summary.minDurationMs).toBe(80);
    expect(summary.maxDurationMs).toBe(120);
    expect(summary.filesPerSecond).toBeCloseTo(dataset.fileCount / 0.1, 5);
    expect(summary.bytesPerSecond).toBeCloseTo((dataset.totalBytes) / 0.1, 5);
  });
});
