import { mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, bench, suite } from 'vitest';

import { createSafeBench } from './bench.runtime';

import type { ContextConfig, ContextResourceBundleConfig } from '@eddie/config';
import { ContextService } from '@eddie/context';
import { LoggerService } from '@eddie/io';
import { TemplateRendererService } from '@eddie/templates';
import { ConfigStore } from '@eddie/config';
import { TemplateRuntimeService } from '@eddie/templates';

import type { ContextPackDataset } from './context-pack.fixtures';
import { prepareContextPackDatasets } from './context-pack.fixtures';
import { aggregatePackMetrics } from './context-pack.metrics';
import { createStructuredReport } from './context-pack.reporting';
import { registerBenchmarkActionEntry } from './benchmark-action.registry';

interface DatasetBenchContext {
  readonly dataset: ContextPackDataset;
  readonly config: ContextConfig;
  readonly durations: number[];
}

const BENCHMARK_NAME = 'context-pack.pack';
const DATASET_NAMES = ['10x1KB', '100x10KB', '500x100KB'] as const;
const PACK_BENCH_ITERATIONS = 3;
const PACK_BENCH_OPTIONS = { iterations: PACK_BENCH_ITERATIONS } as const;

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

function registerScenarioBenchmark(scenario: {
  readonly dataset: ContextPackDataset;
  readonly metrics: ReturnType<typeof aggregatePackMetrics>;
}): void {
  registerBenchmarkActionEntry({
    name: `ContextService.pack benchmarks › pack ${scenario.dataset.name}`,
    unit: 'ms',
    value: scenario.metrics.meanDurationMs,
    extra: {
      iterations: scenario.metrics.iterations,
      min: scenario.metrics.minDurationMs,
      max: scenario.metrics.maxDurationMs,
      filesPerSecond: scenario.metrics.filesPerSecond,
      bytesPerSecond: scenario.metrics.bytesPerSecond,
    },
  });
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

const registerBench = createSafeBench(bench);

suite('ContextService.pack benchmarks', () => {
  const datasetContexts = new Map<string, DatasetBenchContext>();
  let contextService: ContextService;
  let temporaryRoot = '';

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'context-pack-bench-'));
    const datasets = await prepareContextPackDatasets(temporaryRoot);

    const loggerService = new LoggerService();
    loggerService.configure({ level: 'silent' });
    const templateRenderer = new TemplateRendererService(new ConfigStore());
    const templateRuntime = new TemplateRuntimeService(
      templateRenderer,
      loggerService.getLogger('engine:templates')
    );
    contextService = new ContextService(loggerService, templateRuntime);

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
    registerBench(`pack ${datasetName}`, async () => {
      const context = datasetContexts.get(datasetName);
      if (!context) {
        throw new Error(`Dataset context for ${datasetName} was not prepared.`);
      }

      const start = performance.now();
      await contextService.pack(context.config);
      const durationMs = performance.now() - start;
      context.durations.push(durationMs);
    }, PACK_BENCH_OPTIONS);
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

  for (const scenario of scenarios) {
    registerScenarioBenchmark(scenario);
  }

  const report = createStructuredReport({
    benchmarkName: BENCHMARK_NAME,
    scenarios,
    environment: {
      datasetCount: datasetContexts.size,
      commit: process.env.GITHUB_SHA,
    },
  });

  const reportDirectory = process.env.BENCHMARK_ACTION_REPORT_DIR;
  if (reportDirectory) {
    mkdirSync(reportDirectory, { recursive: true });
    writeFileSync(
      join(reportDirectory, `${BENCHMARK_NAME}.json`),
      JSON.stringify(report),
      'utf-8',
    );
  }

  console.log(JSON.stringify(report));
}