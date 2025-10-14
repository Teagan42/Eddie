import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const renameDeletePattern = /rename (and|or) delete chat sessions/i;

function readRootFile(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('README documentation', () => {
  let readme: string;

  beforeAll(() => {
    readme = readRootFile('../README.md');
  });

  it('uses a title that reflects Eddie as a multi-surface agent platform', () => {
    expect(readme.startsWith('# Eddie: Multi-surface Agent Platform\n')).toBe(true);
  });

  it('highlights the web UI surface with screenshots', () => {
    expect(readme).toContain('## Web UI');
    expect(readme).toContain('docs/assets/ui-dashboard.png');
    expect(readme).toContain('docs/assets/ui-run-history.png');
  });

  it('mentions chat session rename and delete capabilities across surfaces', () => {
    expect(readme).toMatch(renameDeletePattern);
  });
});
