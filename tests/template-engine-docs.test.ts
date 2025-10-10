import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const targets = [
  'docs/templates.md',
  'docs/subagents.md',
  'docs/mcp-servers.md',
  'README.md',
];

describe('documentation template engine references', () => {
  it('prefers Jinja terminology over legacy Eta wording', () => {
    for (const relative of targets) {
      const content = readFileSync(join(repoRoot, relative), 'utf8');

      expect(content).not.toMatch(/Nunjucks/i);
      expect(content).not.toMatch(/\.eta\b/);
      expect(content).toMatch(/Jinja/i);
    }
  });
});
