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

  it('requires targeted tests during red/green and agent:check before PR', () => {
    expect(agentsDoc).toMatch(
      /Run targeted tests during RED\/GREEN and finish with `npm run agent:check`. If `npm run agent:check` fails, treat that failure as returning to RED and resolve it before considering the task complete\./,
    );
  });
});
