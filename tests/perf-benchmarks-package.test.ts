import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const manifestUrl = new URL('../packages/perf-benchmarks/package.json', import.meta.url);
const tsconfigUrl = new URL('../packages/perf-benchmarks/tsconfig.json', import.meta.url);
const tsconfigBuildUrl = new URL('../packages/perf-benchmarks/tsconfig.build.json', import.meta.url);
const eslintConfigUrl = new URL('../packages/perf-benchmarks/eslint.config.cjs', import.meta.url);
const vitestConfigUrl = new URL('../packages/perf-benchmarks/vitest.config.ts', import.meta.url);
const rootTsconfigUrl = new URL('../tsconfig.json', import.meta.url);
const rootTsconfigBaseUrl = new URL('../tsconfig.base.json', import.meta.url);
const nestCliConfigUrl = new URL('../nest-cli.json', import.meta.url);
const rootPackageJsonUrl = new URL('../package.json', import.meta.url);
const packageLockUrl = new URL('../package-lock.json', import.meta.url);
const workspaceName = '@eddie/perf-benchmarks';
const packageRoot = 'packages/perf-benchmarks';
const packageSourceRoot = `${packageRoot}/src`;
const packageSourceGlobs = `${packageSourceRoot}/*`;
const packageBuildTsconfigPath = `${packageRoot}/tsconfig.build.json`;
const packageReferencePath = `./${packageRoot}`;
const packageNodeModulesPath = `node_modules/${workspaceName}`;
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
    expect(packageJson.name).toBe(workspaceName);
    expect(packageJson.private).toBe(true);
  });

  it('exposes lint, build, and bench scripts for perf workflows', () => {
    const packageJson = loadManifest();
    expect(packageJson.scripts).toMatchObject(expectedScripts);
  });
});

describe('root workspace references perf benchmarks', () => {
  it('registers the library in the Nest CLI projects map', () => {
    const nestCliConfig = loadJson(nestCliConfigUrl);

    expect(nestCliConfig.projects?.['perf-benchmarks']).toMatchObject({
      type: 'library',
      root: packageRoot,
      sourceRoot: packageSourceRoot,
      compilerOptions: {
        tsConfigPath: packageBuildTsconfigPath,
        deleteOutDir: true,
      },
    });
  });

  it('includes the package in the root tsconfig project references', () => {
    const tsconfig = loadJson(rootTsconfigUrl);

    expect(tsconfig.references).toEqual(
      expect.arrayContaining([{ path: packageReferencePath }]),
    );
  });

  it('maps the @eddie/perf-benchmarks path alias', () => {
    const tsconfigBase = loadJson(rootTsconfigBaseUrl);

    expect(tsconfigBase.compilerOptions?.paths?.['@eddie/perf-benchmarks']).toEqual([
      packageSourceRoot,
    ]);
    expect(tsconfigBase.compilerOptions?.paths?.['@eddie/perf-benchmarks/*']).toEqual([
      packageSourceGlobs,
    ]);
  });

  it('exposes a root npm script for running perf benchmarks', () => {
    const packageJson = loadJson(rootPackageJsonUrl);

    expect(packageJson.scripts?.['bench:perf-benchmarks']).toBe(
      `npm run bench --workspace ${workspaceName} --if-present`,
    );
  });

  it('locks the workspace in the package-lock metadata', () => {
    const packageLock = loadJson(packageLockUrl);

    expect(packageLock.packages?.['packages/perf-benchmarks']).toMatchObject({
      name: workspaceName,
      version: '0.0.0',
    });
  });

  it('links the workspace in node_modules metadata', () => {
    const packageLock = loadJson(packageLockUrl);

    expect(packageLock.packages?.[packageNodeModulesPath]).toMatchObject({
      resolved: packageRoot,
      link: true,
    });
  });
});
