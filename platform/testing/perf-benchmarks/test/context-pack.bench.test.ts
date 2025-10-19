import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type BenchHandler = () => unknown | Promise<unknown>;

type BenchRegistration = {
  readonly name: string;
  readonly handler: BenchHandler;
  readonly options: Record<string, unknown> | undefined;
};

const benchRegistrations: BenchRegistration[] = [];
const beforeAllRegistrations: BenchHandler[] = [];
const afterAllRegistrations: BenchHandler[] = [];

const registryMocks = vi.hoisted(() => ({
  registerBenchmarkActionEntry: vi.fn(),
}));

vi.mock('../src/benchmark-action.registry', () => registryMocks);

vi.mock('@eddie/context', () => ({
  ContextService: class {
    async pack() {}
  },
}));
vi.mock('@eddie/io', () => ({
  LoggerService: class {
    configure() {}
    getLogger() {
      return {};
    }
  },
}));
vi.mock('@eddie/templates', () => ({
  TemplateRendererService: class {},
  TemplateRuntimeService: class {
    constructor() {}
  },
}));

vi.mock('vitest', async () => {
  const actual = await vi.importActual<typeof import('vitest')>('vitest');

  return {
    ...actual,
    bench: vi.fn(
      (name: string, handler: BenchHandler, options?: Record<string, unknown>) => {
        benchRegistrations.push({ name, handler, options });
      },
    ),
    suite: (_name: string, factory: () => void) => {
      factory();
    },
    beforeAll: (callback: BenchHandler) => {
      beforeAllRegistrations.push(callback);
    },
    afterAll: (callback: BenchHandler) => {
      afterAllRegistrations.push(callback);
    },
  } satisfies typeof import('vitest');
});

describe('context-pack benchmarks', () => {
  beforeEach(() => {
    benchRegistrations.length = 0;
    beforeAllRegistrations.length = 0;
    afterAllRegistrations.length = 0;
    registryMocks.registerBenchmarkActionEntry.mockReset();
    vi.resetModules();
  });

  it('configures pack benches with multiple iterations to stabilise results', async () => {
    await import('../src/context-pack.bench');

    expect(beforeAllRegistrations).not.toHaveLength(0);
    expect(afterAllRegistrations).not.toHaveLength(0);
    expect(benchRegistrations).toHaveLength(3);

    for (const registration of benchRegistrations) {
      const iterations = registration.options?.iterations;
      expect(typeof iterations).toBe('number');
      expect(iterations).toBeGreaterThanOrEqual(2);
    }
  });

  it('registers aggregated durations for benchmark action fallback results', async () => {
    const datasetNames = ['10x1KB', '100x10KB', '500x100KB'] as const;
    const datasets = datasetNames.map((name, index) => ({
      name,
      description: `Dataset ${index}`,
      root: `/tmp/${name}`,
      totalBytes: 1024 * (index + 1),
      fileCount: 128 * (index + 1),
      resourceBundles: [],
    }));

    const aggregatePackMetrics = vi
      .fn()
      .mockImplementation(({ dataset }: { dataset: { name: string } }) => {
        const datasetIndex = datasetNames.indexOf(dataset.name as typeof datasetNames[number]);
        const base = 120 + datasetIndex * 10;
        return {
          datasetName: dataset.name,
          durationMs: base + 3.456,
          iterations: 3,
          meanDurationMs: base + 3.456,
          minDurationMs: base,
          maxDurationMs: base + 10.8,
          filesPerSecond: 40 + datasetIndex,
          bytesPerSecond: 2000 + datasetIndex * 100,
          bundleBytes: 0,
        };
      });

    vi.doMock('../src/context-pack.metrics', () => ({
      aggregatePackMetrics,
    }));
    vi.doMock('../src/context-pack.fixtures', () => ({
      prepareContextPackDatasets: vi.fn(async () => datasets),
    }));
    vi.doMock('@eddie/context', () => ({
      ContextService: class {
        async pack() {
          // no-op for tests
        }
      },
    }));
    vi.doMock('@eddie/io', () => ({
      LoggerService: class {
        configure() {}
        getLogger() {
          return {};
        }
      },
    }));
    vi.doMock('@eddie/templates', () => ({
      TemplateRendererService: class {},
      TemplateRuntimeService: class {
        constructor() {}
      },
    }));

    let clock = 0;
    const nowSpy = vi
      .spyOn(performance, 'now')
      .mockImplementation(() => (clock += 5));

    await import('../src/context-pack.bench');

    for (const setup of beforeAllRegistrations) {
      await setup();
    }

    for (const registration of benchRegistrations) {
      await registration.handler();
    }

    for (const teardown of afterAllRegistrations) {
      await teardown();
    }

    expect(registryMocks.registerBenchmarkActionEntry).toHaveBeenCalledTimes(
      datasetNames.length,
    );

    datasetNames.forEach((name, index) => {
      const base = 120 + index * 10;
      expect(registryMocks.registerBenchmarkActionEntry).toHaveBeenCalledWith({
        name: `ContextService.pack benchmarks › pack ${name}`,
        unit: 'ms',
        value: base + 3.456,
        extra: {
          iterations: 3,
          min: base,
          max: base + 10.8,
          filesPerSecond: 40 + index,
          bytesPerSecond: 2000 + index * 100,
        },
      });
    });

    nowSpy.mockRestore();
  });

  it('writes context pack reports to the benchmark action directory', async () => {
    const reportRoot = mkdtempSync(join(tmpdir(), 'context-report-'));

    process.env.BENCHMARK_ACTION_REPORT_DIR = reportRoot;

    await import('../src/context-pack.bench');

    for (const setup of beforeAllRegistrations) {
      await setup();
    }

    for (const registration of benchRegistrations) {
      await registration.handler();
    }

    for (const teardown of afterAllRegistrations) {
      await teardown();
    }

    const reportPath = join(reportRoot, 'context-pack.pack.json');
    const contents = readFileSync(reportPath, 'utf-8');
    const parsed = JSON.parse(contents) as { benchmark: string; scenarios: unknown[] };

    expect(parsed.benchmark).toBe('context-pack.pack');
    expect(Array.isArray(parsed.scenarios)).toBe(true);

    delete process.env.BENCHMARK_ACTION_REPORT_DIR;
  });
});
