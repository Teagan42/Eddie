import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const agentsDoc = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');

describe('root AGENTS.md guidance', () => {
  it('directs contributors to run the agent:check script', () => {
    expect(agentsDoc).toContain('Run `npm run agent:check`');
  });

  it('advises lowering test concurrency when timeouts occur', () => {
    expect(agentsDoc).toContain('WORKSPACE_TEST_CONCURRENCY=1');
  });
});
