import type { bench } from 'vitest';

const BENCH_UNAVAILABLE_MESSAGE = 'bench() is only available in benchmark mode.';

export type BenchRegistration = typeof bench;

export type BenchName = Parameters<BenchRegistration>[0];
export type BenchHandler = Parameters<BenchRegistration>[1];
export type BenchOptions = Parameters<BenchRegistration>[2];

const BENCH_MODE_VALUES = new Set(['bench', 'benchmark']);

type MockCandidate = { mock?: unknown };

const isMockFunction = (value: unknown): value is MockCandidate =>
  typeof value === 'function' && value !== null && 'mock' in (value as MockCandidate);

export const isBenchmarkMode = (): boolean => {
  const mode = process.env.VITEST_MODE?.toLowerCase();
  if (mode && BENCH_MODE_VALUES.has(mode)) {
    return true;
  }

  const lifecycle = process.env.npm_lifecycle_script?.toLowerCase() ?? '';
  if (lifecycle.includes('vitest bench')) {
    return true;
  }

  const normalizedArgs = process.argv.slice(2).map((arg) => arg.toLowerCase());
  return normalizedArgs.some((arg) => BENCH_MODE_VALUES.has(arg));
};

export function isBenchUnavailableError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    typeof error.message === 'string' &&
    error.message.includes(BENCH_UNAVAILABLE_MESSAGE)
  );
}

export function createSafeBench(benchFn: BenchRegistration): BenchRegistration {
  if (!isBenchmarkMode() && !isMockFunction(benchFn)) {
    return (() => undefined) as BenchRegistration;
  }

  return ((name: BenchName, handler: BenchHandler, options?: BenchOptions) => {
    try {
      benchFn(name, handler, options);
    } catch (error) {
      if (!isBenchUnavailableError(error)) {
        throw error;
      }
    }
  }) as BenchRegistration;
}
