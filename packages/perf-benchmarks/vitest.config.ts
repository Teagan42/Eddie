import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type TsConfig = {
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
};

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const tsconfigBase = JSON.parse(
  readFileSync(new URL('../../tsconfig.base.json', import.meta.url), 'utf8'),
) as TsConfig;

const tsconfigPaths = () =>
  Object.entries(tsconfigBase.compilerOptions?.paths ?? {}).reduce(
    (acc, [key, values]) => {
      const aliasKey = key.replace(/\/\*$/, '');
      const target = values[0]?.replace(/\/\*$/, '');

      if (aliasKey && target) {
        acc[aliasKey] = resolve(repoRoot, target);
      }

      return acc;
    },
    {} as Record<string, string>,
  );

const alias = Object.freeze(tsconfigPaths());

export default defineConfig({
  resolve: {
    alias,
  },
  bench: {
    reporters: ['default'],
    outputJson: 'benchmarks/results.json',
  },
});
