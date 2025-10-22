import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type TsConfig = {
  references?: Array<{ path: string }>;
};

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));

function collectTsconfigPaths(startDir: string): string[] {
  const entries = readdirSync(startDir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const fullPath = join(startDir, entry.name);

    if (entry.isDirectory()) {
      return collectTsconfigPaths(fullPath);
    }

    if (entry.isFile() && entry.name === 'tsconfig.json') {
      return [fullPath];
    }

    return [];
  });
}

describe('platform tsconfig references', () => {
  const platformDir = join(ROOT_DIR, 'platform');
  const tsconfigPaths = collectTsconfigPaths(platformDir);

  it('only reference sibling packages that exist', () => {
    const missingReferences = tsconfigPaths.flatMap((configPath) => {
      const contents = readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(contents) as TsConfig;
      const configDir = dirname(configPath);

      if (!parsed.references?.length) {
        return [];
      }

      return parsed.references
        .filter((ref) => ref.path)
        .map((ref) => resolve(configDir, ref.path))
        .filter((referenceDir) => {
          if (!existsSync(referenceDir)) {
            return true;
          }

          if (!statSync(referenceDir).isDirectory()) {
            return true;
          }

          const referencedTsconfig = join(referenceDir, 'tsconfig.json');

          return !existsSync(referencedTsconfig);
        })
        .map((missingDir) => ({
          configPath: relative(ROOT_DIR, configPath),
          missingDir: relative(ROOT_DIR, missingDir),
        }));
    });

    expect(missingReferences).toEqual([]);
  });

  const uiTsconfigPath = join(platformDir, 'ui', 'tsconfig.json');

  it('parses UI workspace tsconfig as strict JSON for tooling compatibility', () => {
    const contents = readFileSync(uiTsconfigPath, 'utf8');

    expect(() => JSON.parse(contents)).not.toThrow();
  });
});
