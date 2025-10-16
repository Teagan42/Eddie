import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const diagramPath = join(repoRoot, 'docs', 'generated', 'config-schema-diagram.md');
const expectedOrientation = 'graph LR';

describe('config schema diagram documentation', () => {
  it('renders the mermaid graph with left-to-right flow', () => {
    const content = readFileSync(diagramPath, 'utf8');

    expect(content).toContain(expectedOrientation);
  });
});
