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
});
