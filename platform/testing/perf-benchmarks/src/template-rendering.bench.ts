import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { afterAll, bench, group, suite } from 'vitest';

import { TemplateRendererService } from '@eddie/templates';
import type { TemplateDescriptor, TemplateVariables } from '@eddie/templates';

const FIXTURE_ROOT = fileURLToPath(
  new URL('../fixtures/templates/', import.meta.url),
);

interface TemplateFixtureDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly template: {
    readonly entry: string;
    readonly baseDir?: string;
    readonly inlineFilename?: string;
  };
  readonly variables: TemplateVariables;
}

export interface TemplateRenderingFixture {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly descriptor: TemplateDescriptor;
  readonly inline: {
    readonly template: string;
    readonly filename: string;
    readonly variables: TemplateVariables;
  };
}

interface RenderSample {
  readonly durationMs: number;
  readonly rendered: string;
  readonly memoryBytes: number;
}

export type TemplateRenderingMode = 'descriptor' | 'inline';

export interface TemplateRenderingMeasurement {
  readonly fixtureId: string;
  readonly label: string;
  readonly mode: TemplateRenderingMode;
  readonly cold: RenderSample;
  readonly warm: RenderSample;
  readonly cacheBusted: RenderSample;
}

type Clock = () => number;

const defaultClock: Clock = () => performance.now();

let cachedFixtures: TemplateRenderingFixture[] | undefined;

const cloneFixture = (fixture: TemplateRenderingFixture): TemplateRenderingFixture =>
  typeof structuredClone === 'function'
    ? structuredClone(fixture)
    : (JSON.parse(JSON.stringify(fixture)) as TemplateRenderingFixture);

const readFixtureDefinition = async (
  directory: string,
): Promise<TemplateRenderingFixture> => {
  const definitionPath = join(directory, 'fixture.json');
  const raw = await fs.readFile(definitionPath, 'utf-8');
  const definition = JSON.parse(raw) as TemplateFixtureDefinition;

  const templatesDir = resolve(
    directory,
    definition.template.baseDir ?? '.',
  );
  const entryPath = resolve(templatesDir, definition.template.entry);
  const inlineFilename = definition.template.inlineFilename
    ? resolve(directory, definition.template.inlineFilename)
    : entryPath;
  const inlineTemplate = await fs.readFile(entryPath, 'utf-8');

  const descriptor: TemplateDescriptor = {
    file: entryPath,
    baseDir: templatesDir,
    variables: definition.variables,
  };

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    descriptor,
    inline: {
      template: inlineTemplate,
      filename: inlineFilename,
      variables: definition.variables,
    },
  } satisfies TemplateRenderingFixture;
};

export async function loadTemplateRenderingFixtures(): Promise<TemplateRenderingFixture[]> {
  if (!cachedFixtures) {
    const entries = await fs.readdir(FIXTURE_ROOT, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(FIXTURE_ROOT, entry.name));

    cachedFixtures = await Promise.all(
      directories.map((directory) => readFixtureDefinition(directory)),
    );
  }

  return cachedFixtures.map((fixture) => cloneFixture(fixture));
}

const measureMemory = () => process.memoryUsage().heapUsed;

const measureRender = async (
  render: () => Promise<string>,
  clock: Clock,
): Promise<RenderSample> => {
  const memoryBefore = measureMemory();
  const start = clock();
  const rendered = await render();
  const end = clock();
  const memoryAfter = measureMemory();

  return {
    durationMs: Math.max(0, end - start),
    rendered,
    memoryBytes: Math.max(0, memoryAfter - memoryBefore),
  } satisfies RenderSample;
};

const touchFile = async (file: string) => {
  const stats = await fs.stat(file);
  const bump = stats.mtimeMs + 5;
  await fs.utimes(file, stats.atime, new Date(bump));
};

export async function measureTemplateRenderingScenario(
  fixture: TemplateRenderingFixture,
  options: { clock?: Clock; mode?: TemplateRenderingMode } = {},
): Promise<TemplateRenderingMeasurement> {
  const renderer = new TemplateRendererService();
  const clock = options.clock ?? defaultClock;
  const mode = options.mode ?? 'descriptor';

  const descriptorVariables = fixture.descriptor.variables ?? {};
  const runDescriptor = () =>
    renderer.renderTemplate(fixture.descriptor, descriptorVariables);
  const runInline = () =>
    renderer.renderString(
      fixture.inline.template,
      fixture.inline.variables,
      fixture.inline.filename,
    );

  const render = mode === 'inline' ? runInline : runDescriptor;

  const cold = await measureRender(render, clock);
  const warm = await measureRender(render, clock);

  if (mode === 'descriptor') {
    await touchFile(fixture.descriptor.file);
  }

  const cacheBusted = await measureRender(render, clock);

  return {
    fixtureId: fixture.id,
    label: fixture.label,
    mode,
    cold,
    warm,
    cacheBusted,
  } satisfies TemplateRenderingMeasurement;
}

interface ScenarioSeries {
  readonly fixture: TemplateRenderingFixture;
  readonly mode: TemplateRenderingMode;
  coldDurations: number[];
  warmDurations: number[];
  cacheBustedDurations: number[];
  coldMemory: number[];
  warmMemory: number[];
  cacheBustedMemory: number[];
}

const scenarioKey = (
  fixtureId: string,
  mode: TemplateRenderingMode,
): string => `${fixtureId}:${mode}`;

const seriesByKey = new Map<string, ScenarioSeries>();

const ensureSeries = (
  fixture: TemplateRenderingFixture,
  mode: TemplateRenderingMode,
): ScenarioSeries => {
  const key = scenarioKey(fixture.id, mode);
  const existing = seriesByKey.get(key);
  if (existing) {
    return existing;
  }
  const created: ScenarioSeries = {
    fixture,
    mode,
    coldDurations: [],
    warmDurations: [],
    cacheBustedDurations: [],
    coldMemory: [],
    warmMemory: [],
    cacheBustedMemory: [],
  };
  seriesByKey.set(key, created);
  return created;
};

const recordMeasurement = (
  series: ScenarioSeries,
  measurement: TemplateRenderingMeasurement,
) => {
  series.coldDurations.push(measurement.cold.durationMs);
  series.warmDurations.push(measurement.warm.durationMs);
  series.cacheBustedDurations.push(measurement.cacheBusted.durationMs);
  series.coldMemory.push(measurement.cold.memoryBytes);
  series.warmMemory.push(measurement.warm.memoryBytes);
  series.cacheBustedMemory.push(measurement.cacheBusted.memoryBytes);
};

const summarize = (samples: number[]) => {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      samples: [],
    } as const;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mean = sum / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;

  return {
    sampleCount: sorted.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean,
    median,
    samples: sorted,
  } as const;
};

const emitScenarioReport = () => {
  if (seriesByKey.size === 0) {
    return;
  }

  const scenarios = Array.from(seriesByKey.values()).map((series) => ({
    id: scenarioKey(series.fixture.id, series.mode),
    fixtureId: series.fixture.id,
    label: `${series.fixture.label} [${series.mode}]`,
    description: series.fixture.description,
    cold: {
      durations: summarize(series.coldDurations),
      memoryBytes: summarize(series.coldMemory),
    },
    warm: {
      durations: summarize(series.warmDurations),
      memoryBytes: summarize(series.warmMemory),
    },
    cacheBusted: {
      durations: summarize(series.cacheBustedDurations),
      memoryBytes: summarize(series.cacheBustedMemory),
    },
  }));

  const report = {
    benchmark: 'template-rendering.nunjucks',
    environment: {
      node: process.version,
      commit: process.env.GITHUB_SHA,
    },
    scenarios,
  };

  console.log(JSON.stringify(report));
};

export interface TemplateBenchmarkRegistrationContext {
  readonly suite: typeof suite;
  readonly group: typeof group;
  readonly bench: typeof bench;
  readonly loadFixtures?: () => Promise<TemplateRenderingFixture[]>;
}

export async function defineTemplateRenderingBenchmarks({
  suite: registerSuite,
  group: registerGroup,
  bench: registerBench,
  loadFixtures: loadFixturesFn = loadTemplateRenderingFixtures,
}: TemplateBenchmarkRegistrationContext): Promise<void> {
  const fixtures = await loadFixturesFn();

  registerSuite('TemplateRendererService render scenarios', () => {
    afterAll(() => {
      emitScenarioReport();
    });

    for (const fixture of fixtures) {
      for (const mode of ['descriptor', 'inline'] as const) {
        registerGroup(`${fixture.label} (${mode})`, () => {
          registerBench(`${fixture.id} ${mode}`, async () => {
            const measurement = await measureTemplateRenderingScenario(
              fixture,
              { mode },
            );
            const series = ensureSeries(fixture, mode);
            recordMeasurement(series, measurement);
          });
        });
      }
    }
  });
}

const vitestState = (import.meta as unknown as {
  vitest?: { mode?: string };
}).vitest;

if (vitestState?.mode === 'benchmark') {
  void defineTemplateRenderingBenchmarks({
    suite,
    group,
    bench,
    loadFixtures: loadTemplateRenderingFixtures,
  }).catch((error) => {
    console.error('Failed to register template rendering benchmarks', error);
  });
}
