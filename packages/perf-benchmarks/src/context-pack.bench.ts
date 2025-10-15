import { rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, bench, suite } from 'vitest';

import type { ContextConfig, ContextResourceBundleConfig } from '@eddie/config';
import { ContextService } from '@eddie/context';
import { LoggerService } from '@eddie/io';
import { TemplateRendererService } from '@eddie/templates';

import type { ContextPackDataset } from './context-pack.fixtures';
import { prepareContextPackDatasets } from './context-pack.fixtures';
import { aggregatePackMetrics } from './context-pack.metrics';
import { createStructuredReport } from './context-pack.reporting';

interface DatasetBenchContext {
  readonly dataset: ContextPackDataset;
  readonly config: ContextConfig;
  readonly durations: number[];
}

const BENCHMARK_NAME = 'context-pack.pack';
const DATASET_NAMES = ['10x1KB', '100x10KB', '500x100KB'] as const;

function createBundleConfig(dataset: ContextPackDataset): ContextResourceBundleConfig[] {
  return dataset.resourceBundles.map((bundle, index) => ({
    id: `${dataset.name}-bundle-${index}`,
    type: 'bundle',
    name: bundle.name,
    baseDir: dirname(bundle.path),
    include: [basename(bundle.path)],
  } satisfies ContextResourceBundleConfig));
}

function computeBundleBytes(dataset: ContextPackDataset): number {
  return dataset.resourceBundles.reduce((total, bundle) => total + bundle.bytes, 0);
}

function createContextConfig(dataset: ContextPackDataset): ContextConfig {
  const bundleBytes = computeBundleBytes(dataset);
  return {
    baseDir: dataset.root,
    include: ['**/*'],
    exclude: [],
    maxBytes: dataset.totalBytes + bundleBytes,
    maxFiles: Math.max(dataset.fileCount, 1_000),
    resources: createBundleConfig(dataset),
  } satisfies ContextConfig;
}

suite('ContextService.pack benchmarks', () => {
  const datasetContexts = new Map<string, DatasetBenchContext>();
  let contextService: ContextService;
  let temporaryRoot = '';

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'context-pack-bench-'));
    const datasets = await prepareContextPackDatasets(temporaryRoot);

    const loggerService = new LoggerService();
    loggerService.configure({ level: 'silent' });
    const templateRenderer = new TemplateRendererService();
    contextService = new ContextService(loggerService, templateRenderer);

    for (const dataset of datasets) {
      datasetContexts.set(dataset.name, {
        dataset,
        config: createContextConfig(dataset),
        durations: [],
      });
    }
  });

  afterAll(async () => {
    emitStructuredReport(datasetContexts);

    if (temporaryRoot) {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  for (const datasetName of DATASET_NAMES) {
    bench(`pack ${datasetName}`, async () => {
      const context = datasetContexts.get(datasetName);
      if (!context) {
        throw new Error(`Dataset context for ${datasetName} was not prepared.`);
      }

      const start = performance.now();
      await contextService.pack(context.config);
      const durationMs = performance.now() - start;
      context.durations.push(durationMs);
    });
  }
});

function emitStructuredReport(datasetContexts: Map<string, DatasetBenchContext>): void {
  const scenarios = Array.from(datasetContexts.values())
    .filter((entry) => entry.durations.length > 0)
    .map((entry) => ({
      dataset: entry.dataset,
      metrics: aggregatePackMetrics({ dataset: entry.dataset, durationsMs: entry.durations }),
    }));

  if (scenarios.length === 0) {
    return;
  }

  const report = createStructuredReport({
    benchmarkName: BENCHMARK_NAME,
    scenarios,
    environment: {
      datasetCount: datasetContexts.size,
      commit: process.env.GITHUB_SHA,
    },
  });

  console.log(JSON.stringify(report));
}
