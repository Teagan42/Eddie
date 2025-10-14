import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const read = (relative: string) => readFileSync(join(repoRoot, relative), 'utf8');

describe('code-assistant router instructions', () => {
  let conventions: string;
  let manager: string;

  beforeAll(() => {
    conventions = read('examples/code-assistant/prompts/partials/conventions.jinja');
    manager = read('examples/code-assistant/prompts/router_manager.jinja');
  });

  it('conventions partial avoids duplicating spawn_subagent instructions', () => {
    expect(conventions).not.toMatch(/Delegation \(spawn_subagent\)/i);
    expect(conventions).not.toMatch(/spawn_subagent tool/i);
  });

  const managerExpectations: Array<{ name: string; pattern: RegExp }> = [
    {
      name: 'enforces continuous delegation until completion',
      pattern: /Continue delegating via spawn_subagent until the feature is complete/i,
    },
    {
      name: 'allows rerouting after quality gate failures',
      pattern: /If a quality_gate blocks progress, route back to red, green, or refactor as needed\./i,
    },
    {
      name: 'short circuits red when existing checks are failing',
      pattern:
        /Short circuit RED phase when the lint, build or test suite is already failing, GREEN should address/i,
    },
  ];

  it.each(managerExpectations)('router manager %s', ({ pattern }) => {
    expect(manager).toMatch(pattern);
  });
});
