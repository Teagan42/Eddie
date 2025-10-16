import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const platformWorkspaceImportPattern = /from\s+["']\.\.\/\.vitest\.workspace\.config["']/;

function readTrackedFiles(pattern: string): string[] {
  const result = spawnSync('git', ['ls-files', pattern], { cwd: repoRoot, encoding: 'utf8' });

  if (result.error) {
    throw result.error;
  }

  return result.stdout
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
}

describe('vitest workspace configuration alignment', () => {
  it('loads the shared workspace config from the platform root', () => {
    const configFiles = readTrackedFiles('platform/*/*/vitest.config.ts');
    const offenders = configFiles.filter((file) => {
      const contents = readFileSync(join(repoRoot, file), 'utf8');
      return platformWorkspaceImportPattern.test(contents);
    });

    expect(offenders).toEqual([]);
  });

  it('resolves package aliases from the platform directory', () => {
    const appConfigs = ['apps/api/vitest.config.ts', 'apps/cli/vitest.config.ts'];

    const offenders = appConfigs.filter((file) => {
      const contents = readFileSync(join(repoRoot, file), 'utf8');
      return contents.includes('"packages"');
    });

    expect(offenders).toEqual([]);
  });

  it('loads the engine test config from the platform root helpers', () => {
    const engineTestConfig = readFileSync(
      join(repoRoot, 'platform/runtime/engine/test/vitest-config.test.ts'),
      'utf8',
    );

    expect(engineTestConfig).toContain('from "../../.vitest.workspace.config"');
  });
});
