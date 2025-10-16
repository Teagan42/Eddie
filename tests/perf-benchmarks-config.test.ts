import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const perfBenchmarksConfigPath = '../platform/testing/perf-benchmarks/eslint.config.cjs';

describe('perf benchmark lint config', () => {
  it('resolves the shared eslint configuration', () => {
    expect(() => require(perfBenchmarksConfigPath)).not.toThrow();
  });
});
