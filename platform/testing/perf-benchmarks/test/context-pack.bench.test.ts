import { beforeEach, describe, expect, it, vi } from 'vitest';

type BenchHandler = () => unknown | Promise<unknown>;

type BenchRegistration = {
  readonly name: string;
  readonly handler: BenchHandler;
  readonly options: Record<string, unknown> | undefined;
};

type AsyncFactoryRegistration = (
  name: string,
  factory: () => unknown | Promise<unknown>,
) => void;

type AsyncBenchRegistration = (
  name: string,
  handler: () => unknown | Promise<unknown>,
  options?: Record<string, unknown>,
) => void;

const benchRegistrations: BenchRegistration[] = [];
const beforeAllRegistrations: BenchHandler[] = [];
const afterAllRegistrations: BenchHandler[] = [];

const registryMocks = vi.hoisted(() => ({
  registerBenchmarkActionEntry: vi.fn(),
}));

vi.mock('../src/benchmark-action.registry', () => registryMocks);

vi.mock('vitest', async () => {
  const actual = await vi.importActual<typeof import('vitest')>('vitest');

  return {
    ...actual,
    bench: (name: string, handler: BenchHandler, options?: Record<string, unknown>) => {
      benchRegistrations.push({ name, handler, options });
    },
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
    const { defineContextPackBenchmarks } = await import('../src/context-pack.bench');

    await defineContextPackBenchmarks({
      suite: (name, factory) => {
        expect(name).toBe('ContextService.pack benchmarks');
        factory();
      },
      bench: (name, handler, options) => {
        benchRegistrations.push({ name, handler, options });
      },
    });

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

    const { defineContextPackBenchmarks } = await import('../src/context-pack.bench');

    await defineContextPackBenchmarks({
      suite: (_name, factory) => {
        factory();
      },
      bench: (name, handler, options) => {
        benchRegistrations.push({ name, handler, options });
      },
    });

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

  it('awaits dataset preparation before registering pack benches', async () => {
    const registerSuite = vi.fn<AsyncFactoryRegistration>((name, factory) => {
      expect(name).toBe('ContextService.pack benchmarks');
      factory();
    });
    const registerBench = vi.fn<AsyncBenchRegistration>((name, handler, options) => {
      benchRegistrations.push({ name, handler, options });
    });

    const deferredDatasets = (() => {
      let resolve: ((value: readonly BenchDatasetMock[]) => void) | undefined;
      const promise = new Promise<readonly BenchDatasetMock[]>((res) => {
        resolve = res;
      });
      return { promise, resolve: resolve! };
    })();

    type BenchDatasetMock = {
      readonly name: string;
      readonly description: string;
      readonly root: string;
      readonly totalBytes: number;
      readonly fileCount: number;
      readonly resourceBundles: readonly [];
    };

    const datasetMocks: readonly BenchDatasetMock[] = (
      ['10x1KB', '100x10KB', '500x100KB'] as const
    ).map((name, index) => ({
      name,
      description: `Dataset ${index}`,
      root: `/tmp/${name}`,
      totalBytes: 1024 * (index + 1),
      fileCount: 10 * (index + 1),
      resourceBundles: [],
    }));

    const contextServicePack = vi.fn().mockResolvedValue(undefined);

    const prepareContextPackDatasets = vi.fn(() => deferredDatasets.promise);

    vi.doMock('../src/context-pack.fixtures', () => ({
      prepareContextPackDatasets,
    }));
    vi.doMock('@eddie/context', () => ({
      ContextService: class {
        async pack(config: unknown) {
          contextServicePack(config);
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

    const { defineContextPackBenchmarks } = await import('../src/context-pack.bench');

    defineContextPackBenchmarks({
      suite: registerSuite,
      bench: registerBench,
    });

    expect(registerSuite).toHaveBeenCalledTimes(1);
    expect(benchRegistrations).toHaveLength(datasetMocks.length);
    expect(beforeAllRegistrations).toHaveLength(1);
    expect(prepareContextPackDatasets).not.toHaveBeenCalled();

    const beforeAllExecution = Promise.all(beforeAllRegistrations.map((callback) => callback()));

    deferredDatasets.resolve(datasetMocks);
    await beforeAllExecution;

    expect(prepareContextPackDatasets).toHaveBeenCalledTimes(1);
    expect(contextServicePack).not.toHaveBeenCalled();

    for (const registration of benchRegistrations) {
      await registration.handler();
    }

    expect(contextServicePack).toHaveBeenCalledTimes(datasetMocks.length);

    for (const teardown of afterAllRegistrations) {
      await teardown();
    }
  });
});
