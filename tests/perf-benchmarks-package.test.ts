import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const manifestUrl = new URL('../packages/perf-benchmarks/package.json', import.meta.url);
const tsconfigUrl = new URL('../packages/perf-benchmarks/tsconfig.json', import.meta.url);
const tsconfigBuildUrl = new URL('../packages/perf-benchmarks/tsconfig.build.json', import.meta.url);
const eslintConfigUrl = new URL('../packages/perf-benchmarks/eslint.config.cjs', import.meta.url);
const vitestConfigUrl = new URL('../packages/perf-benchmarks/vitest.config.ts', import.meta.url);
const loadManifest = () => JSON.parse(readFileSync(manifestUrl, 'utf8'));
const loadJson = (url: URL) => JSON.parse(readFileSync(url, 'utf8'));
const loadModule = async (url: URL) => {
  const module = await import(url.href);
  return module.default ?? module;
};
const expectedScripts = Object.freeze({
  lint: 'eslint --no-error-on-unmatched-pattern .',
  build: expect.any(String),
  bench: 'vitest bench',
});

describe('@eddie/perf-benchmarks workspace configuration', () => {
  it('configures TypeScript compilation like other packages', () => {
    const tsconfig = loadJson(tsconfigUrl);

    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    expect(tsconfig.compilerOptions).toMatchObject({
      composite: true,
      rootDir: 'src',
      outDir: 'dist',
      declaration: true,
      declarationMap: true,
      tsBuildInfoFile: 'dist/tsconfig.tsbuildinfo',
    });
    expect(tsconfig.include).toEqual(['src/**/*.ts']);
  });

  it('extends the package tsconfig for build outputs', () => {
    const tsconfigBuild = loadJson(tsconfigBuildUrl);

    expect(tsconfigBuild.extends).toBe('./tsconfig.json');
    expect(tsconfigBuild.include).toEqual(['src/**/*.ts']);
  });

  it('shares the repo eslint configuration for local linting', async () => {
    const module = await loadModule(eslintConfigUrl);

    expect(Array.isArray(module)).toBe(true);
  });

  it('reuses the shared vitest config factory for benches', async () => {
    const vitestConfig = await loadModule(vitestConfigUrl);

    expect(vitestConfig.test?.include).toContain('test/**/*.test.ts');
    expect(vitestConfig.test?.coverage?.reportsDirectory).toContain('perf-benchmarks');
  });
});

describe('@eddie/perf-benchmarks package manifest', () => {
  it('declares the perf benchmarks workspace as private', () => {
    const packageJson = loadManifest();
    expect(packageJson.name).toBe('@eddie/perf-benchmarks');
    expect(packageJson.private).toBe(true);
  });

  it('exposes lint, build, and bench scripts for perf workflows', () => {
    const packageJson = loadManifest();
    expect(packageJson.scripts).toMatchObject(expectedScripts);
  });
});
