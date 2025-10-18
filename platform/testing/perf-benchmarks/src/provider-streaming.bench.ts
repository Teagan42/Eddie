import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, bench, suite, vi } from 'vitest';

import { OpenAIAdapter } from '@eddie/providers';
import type { StreamEvent, StreamOptions } from '@eddie/types';

import { createSafeBench } from './bench.runtime';

const { streamMock, openAIConstructor } = vi.hoisted(() => {
  const stream = vi.fn();
  const ctor = vi.fn().mockImplementation(() => ({
    responses: {
      stream,
    },
  }));
  return { streamMock: stream, openAIConstructor: ctor };
});

vi.mock('openai', () => ({
  default: openAIConstructor,
}));

const FIXTURE_ROOT = fileURLToPath(
  new URL(resolve(__dirname, '../fixtures/providers/'), 'file://'),
);


const REGRESSION_THRESHOLD_PERCENT = 25;

export interface ProviderStreamFixture {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly options: StreamOptions;
  readonly provider: {
    readonly events: unknown[];
    readonly finalResponse: unknown;
  };
  readonly expectations: {
    readonly streamEvents: StreamEvent[];
  };
}

interface StreamIterationResult {
  readonly durationMs: number;
  readonly events: StreamEvent[];
}

export interface ProviderStreamMeasurement {
  readonly fixtureId: string;
  readonly label: string;
  readonly coldStart: StreamIterationResult;
  readonly warmStream: StreamIterationResult;
}

type Clock = () => number;

const defaultClock: Clock = () => performance.now();

const fixtureCache: ProviderStreamFixture[] = readdirSync(FIXTURE_ROOT)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => {
    const raw = readFileSync(join(FIXTURE_ROOT, file), 'utf-8');
    return JSON.parse(raw) as ProviderStreamFixture;
  });

const cloneFixture = (fixture: ProviderStreamFixture): ProviderStreamFixture =>
  typeof structuredClone === 'function'
    ? structuredClone(fixture)
    : (JSON.parse(JSON.stringify(fixture)) as ProviderStreamFixture);

export async function loadProviderStreamFixtures(): Promise<ProviderStreamFixture[]> {
  return fixtureCache.map((fixture) => cloneFixture(fixture));
}

const createFixtureStream = (fixture: ProviderStreamFixture) => ({
  [Symbol.asyncIterator]: () =>
    (async function* () {
      for (const event of fixture.provider.events) {
        yield event;
      }
    })(),
  finalResponse: async () => fixture.provider.finalResponse,
});

const collectStream = async (
  iterator: AsyncIterable<StreamEvent>,
): Promise<StreamEvent[]> => {
  const collected: StreamEvent[] = [];
  for await (const event of iterator) {
    collected.push(event);
  }
  return collected;
};

const measureIteration = async (
  adapter: OpenAIAdapter,
  fixture: ProviderStreamFixture,
  clock: Clock,
): Promise<StreamIterationResult> => {
  streamMock.mockResolvedValueOnce(createFixtureStream(fixture));
  const start = clock();
  const events = await collectStream(adapter.stream(fixture.options));
  const end = clock();
  return {
    durationMs: Math.max(0, end - start),
    events,
  } satisfies StreamIterationResult;
};

let warmAdapter: OpenAIAdapter | undefined;

const getWarmAdapter = (): OpenAIAdapter => {
  if (!warmAdapter) {
    warmAdapter = new OpenAIAdapter({});
  }
  return warmAdapter;
};

export async function measureProviderStreamScenario(
  fixture: ProviderStreamFixture,
  options: { clock?: Clock } = {},
): Promise<ProviderStreamMeasurement> {
  const clock = options.clock ?? defaultClock;
  streamMock.mockReset();

  const coldAdapter = new OpenAIAdapter({});
  const coldStart = await measureIteration(coldAdapter, fixture, clock);

  const warm = getWarmAdapter();
  const warmStream = await measureIteration(warm, fixture, clock);

  return {
    fixtureId: fixture.id,
    label: fixture.label,
    coldStart,
    warmStream,
  } satisfies ProviderStreamMeasurement;
}

interface ScenarioSeries {
  readonly fixture: ProviderStreamFixture;
  coldStartDurations: number[];
  warmStreamDurations: number[];
  lastEvents?: {
    cold: StreamEvent[];
    warm: StreamEvent[];
  };
}

const scenarioSeriesById = new Map<string, ScenarioSeries>();

const ensureScenarioSeries = (
  fixture: ProviderStreamFixture,
): ScenarioSeries => {
  const existing = scenarioSeriesById.get(fixture.id);
  if (existing) {
    return existing;
  }
  const created: ScenarioSeries = {
    fixture,
    coldStartDurations: [],
    warmStreamDurations: [],
    lastEvents: undefined,
  };
  scenarioSeriesById.set(fixture.id, created);
  return created;
};

const summarize = (samples: number[]) => {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      minMs: 0,
      maxMs: 0,
      meanMs: 0,
      medianMs: 0,
      samples: [],
    } as const;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / sorted.length;
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!;

  return {
    sampleCount: sorted.length,
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
    meanMs: mean,
    medianMs: median,
    samples: sorted,
  } as const;
};

const withThreshold = (samples: number[]) => ({
  ...summarize(samples),
  thresholdPercent: REGRESSION_THRESHOLD_PERCENT,
});

const emitScenarioReport = () => {
  if (scenarioSeriesById.size === 0) {
    return;
  }

  const scenarios = Array.from(scenarioSeriesById.values()).map((series) => {
    const coldSummary = withThreshold(series.coldStartDurations);
    const warmSummary = withThreshold(series.warmStreamDurations);
    const eventCount = series.lastEvents?.cold.length ?? 0;

    return {
      id: series.fixture.id,
      label: series.fixture.label,
      description: series.fixture.description,
      eventCount,
      coldStart: coldSummary,
      warmStream: warmSummary,
    };
  });

  const report = {
    benchmark: 'provider-streaming.openai',
    regressionThresholdPercent: REGRESSION_THRESHOLD_PERCENT,
    scenarios,
    environment: {
      node: process.version,
      commit: process.env.GITHUB_SHA,
    },
  };

  console.log(JSON.stringify(report));
};

const registerBench = createSafeBench(bench);

suite('OpenAIAdapter.stream recorded scenarios', () => {
  beforeAll(() => {
    streamMock.mockReset();
    openAIConstructor.mockClear();
  });

  afterAll(() => {
    emitScenarioReport();
  });

  for (const fixture of fixtureCache) {
    registerBench(`${fixture.label} (cold + warm)`, async () => {
      const measurement = await measureProviderStreamScenario(fixture);
      const series = ensureScenarioSeries(fixture);
      series.coldStartDurations.push(measurement.coldStart.durationMs);
      series.warmStreamDurations.push(measurement.warmStream.durationMs);
      series.lastEvents = {
        cold: measurement.coldStart.events,
        warm: measurement.warmStream.events,
      };
    });
  }
});
