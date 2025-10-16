import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const allowedFiles = new Set([
  'tests/workspaces-config.test.ts',
  'tests/packages-prefix-audit.test.ts',
  '.gitignore',
]);

const disallowedSegments = ['packages/', 'packages\\/'];

describe('legacy packages prefix audit', () => {
  it('rejects unexpected packages/ path references', () => {
    const result = spawnSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' });

    if (result.error) {
      throw result.error;
    }

    const trackedFiles = result.stdout
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean);

    const matches = trackedFiles
      .filter((file) => !allowedFiles.has(file))
      .flatMap((file) => {
        try {
          const content = readFileSync(join(repoRoot, file), 'utf8');
          return disallowedSegments
            .filter((segment) => content.includes(segment))
            .map((segment) => `${file}:${segment}`);
        } catch {
          return [];
        }
      });

    expect(matches).toEqual([]);
  });
});
