import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const rootPackageJson = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8'),
);

const packageDir = join(repoRoot, 'packages', 'perf-benchmarks');

const loadJson = (relativePath: string) =>
  JSON.parse(readFileSync(join(packageDir, relativePath), 'utf8'));

const packageJson = () => loadJson('package.json');
const tsconfigJson = () => loadJson('tsconfig.json');
const vitestConfigSource = () =>
  readFileSync(join(packageDir, 'vitest.config.ts'), 'utf8');

const benchmarksDoc = () =>
  readFileSync(join(repoRoot, 'docs', 'performance-benchmarks.md'), 'utf8');

describe('performance benchmarks workspace registration', () => {
  it('includes the perf benchmarks package in the workspace list', () => {
    expect(rootPackageJson.workspaces).toContain('packages/perf-benchmarks');
  });

  it('provides a convenience bench script at the repo root', () => {
    expect(rootPackageJson.scripts.bench).toBe(
      'npm run bench --workspace @eddie/perf-benchmarks',
    );
  });
});

describe('packages/perf-benchmarks package manifest', () => {
  it('declares a private workspace with a vitest bench script', () => {
    const manifest = packageJson();

    expect(manifest.name).toBe('@eddie/perf-benchmarks');
    expect(manifest.private).toBe(true);
    expect(manifest.scripts?.bench).toBe('vitest bench');
    expect(manifest.scripts?.test).toBe('vitest bench --run --passWithNoTests');
  });
});

describe('packages/perf-benchmarks/tsconfig.json', () => {
  it('extends the repo base config so path aliases resolve', () => {
    const config = tsconfigJson();

    expect(config.extends).toBe('../../tsconfig.base.json');
  });
});

describe('packages/perf-benchmarks/vitest.config.ts', () => {
  it('enables benchmark runner with tsconfig path support and json reporting', () => {
    const source = vitestConfigSource();

    expect(source).toMatch(/defineConfig/);
    expect(source).toMatch(/bench:\s*\{/);
    expect(source).toMatch(/tsconfigPaths/);
    expect(source).toMatch(/reporters?/i);
    expect(source).toMatch(/json/i);
  });
});

describe('performance benchmarks documentation', () => {
  it('explains how to run the bench command and interpret the output', () => {
    const content = benchmarksDoc();

    expect(content).toMatch(/npm run bench/);
    expect(content).toMatch(/JSON/i);
    expect(content).toMatch(/Vitest/i);
  });
});
