import { describe, expect, it } from 'vitest';

import type { ContextPackDataset } from '../src/context-pack.fixtures';
import { aggregatePackMetrics } from '../src/context-pack.metrics';
import { createStructuredReport } from '../src/context-pack.reporting';

describe('createStructuredReport', () => {
  const dataset: ContextPackDataset = {
    name: 'structured',
    description: 'Structured dataset',
    root: '/tmp/structured',
    fileCount: 8,
    totalBytes: 8 * 1024,
    resourceBundles: [
      { name: 'bundle.tar', path: '/tmp/bundle.tar', bytes: 3 * 1024 },
    ],
  };

  it('produces a benchmark report containing dataset and throughput metrics', () => {
    const metrics = aggregatePackMetrics({ dataset, durationsMs: [90, 100, 110] });

    const report = createStructuredReport({
      benchmarkName: 'context-pack.pack',
      scenarios: [{ dataset, metrics }],
      environment: { node: 'v0.0-test' },
    });

    expect(report.benchmark).toBe('context-pack.pack');
    expect(report.environment.node).toBe('v0.0-test');
    expect(report.scenarios).toHaveLength(1);

    const [scenario] = report.scenarios;
    expect(scenario.dataset).toMatchObject({
      name: dataset.name,
      description: dataset.description,
      fileCount: dataset.fileCount,
      totalBytes: dataset.totalBytes,
      bundleBytes: metrics.bundleBytes,
    });

    expect(scenario.metrics).toMatchObject({
      iterations: metrics.iterations,
      meanDurationMs: metrics.meanDurationMs,
      minDurationMs: metrics.minDurationMs,
      maxDurationMs: metrics.maxDurationMs,
      filesPerSecond: metrics.filesPerSecond,
      bytesPerSecond: metrics.bytesPerSecond,
    });
  });
});
