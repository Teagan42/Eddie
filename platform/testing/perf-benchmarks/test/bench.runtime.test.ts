import { afterEach, describe, expect, it } from 'vitest';

import { isBenchmarkMode } from '../src/bench.runtime';

describe('bench runtime detection', () => {
  const originalEnv = process.env.VITEST_MODE;
  const originalScript = process.env.npm_lifecycle_script;
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.env.VITEST_MODE = originalEnv;
    if (originalScript === undefined) {
      delete process.env.npm_lifecycle_script;
    } else {
      process.env.npm_lifecycle_script = originalScript;
    }
    process.argv = [...originalArgv];
  });

  it('returns true when vitest bench is invoked without VITEST_MODE', () => {
    delete process.env.VITEST_MODE;
    process.argv = ['/node', '/vitest', 'bench', '--run'];

    expect(isBenchmarkMode()).toBe(true);
  });

  it('returns true when npm lifecycle script runs vitest bench', () => {
    delete process.env.VITEST_MODE;
    process.env.npm_lifecycle_script = 'vitest bench --run';
    process.argv = ['/node', '/worker', '--run'];

    expect(isBenchmarkMode()).toBe(true);
  });
});
