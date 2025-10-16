import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const legacyConfigSegment = 'apps/cli/src/config';

const docsToCheck = [
  'docs/cli-reference.md',
  'docs/subagents.md',
  'docs/mcp-servers.md',
];

describe('cli config doc paths', () => {
  it('uses platform config references instead of legacy apps paths', () => {
    const violations = docsToCheck
      .map((relativePath) => {
        const content = readFileSync(join(repoRoot, relativePath), 'utf8');
        return content.includes(legacyConfigSegment) ? relativePath : null;
      })
      .filter((value): value is string => Boolean(value));

    expect(violations).toEqual([]);
  });
});
