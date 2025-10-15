import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = join(__dirname, '../../packages/perf-benchmarks');
const manifestPath = join(packageRoot, 'package.json');

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

  it('provides eslint, tsconfig, and vitest configs tailored for benchmarking', async () => {
    const require = createRequire(import.meta.url);

    const eslintConfig = require(join(packageRoot, '.eslintrc.cjs'));
    expect(Array.isArray(eslintConfig.extends)).toBe(true);
    expect(eslintConfig.extends).toContain('../../.eslintrc.cjs');

    const tsconfigPath = join(packageRoot, 'tsconfig.json');
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8')) as {
      extends?: string;
      compilerOptions?: Record<string, unknown>;
      include?: string[];
    };
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    expect(tsconfig.compilerOptions).toMatchObject({
      rootDir: 'bench',
    });
    expect(tsconfig.include).toContain('bench/**/*.ts');

    const vitestConfigModule = await import(
      pathToFileURL(join(packageRoot, 'vitest.config.ts')).toString()
    );
    const vitestConfig = vitestConfigModule.default as {
      test?: {
        benchmark?: {
          include?: string[];
        };
      };
    };

    expect(vitestConfig.test?.benchmark?.include).toContain(
      'bench/**/*.bench.ts',
    );
  });
});
