import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function readRepoFile(...segments: string[]) {
  return readFileSync(join(repoRoot, ...segments), 'utf8');
}

const requiredSegments = [
  'platform/core/config',
  'platform/runtime/context',
  'platform/runtime/engine',
  'platform/integrations/providers',
];

describe('cli agents guide documentation', () => {
  it('references platform path structure for shared packages', () => {
    const content = readRepoFile('apps', 'cli', 'AGENTS.md');

    const missingSegments = requiredSegments.filter(
      (segment) => !content.includes(segment),
    );

    expect(missingSegments).toEqual([]);
  });
});
