import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifestPath = join(
  __dirname,
  '../../packages/perf-benchmarks/package.json',
);

const loadManifest = () => JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
};

describe('perf-benchmarks package manifest', () => {
  it('declares private workspace with bench script invoking eslint and vitest bench', () => {
    const manifest = loadManifest();

    expect(manifest).toMatchObject({
      name: '@eddie/perf-benchmarks',
      private: true,
    });

    const { bench: benchScript, test: testScript } = manifest.scripts ?? {};

    expect(typeof benchScript).toBe('string');
    expect(benchScript).toContain('eslint');
    expect(benchScript).toContain('vitest bench');

    expect(typeof testScript).toBe('string');
    expect(testScript).toContain('echo');
  });
});
