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

  describe('conventions partial', () => {
    const conventionsExpectations: Array<{ name: string; pattern: RegExp }> = [
      {
        name: 'documents the spawn_subagent delegation schema',
        pattern: /Delegation \(spawn_subagent\)/i,
      },
      {
        name: 'explains how to invoke the spawn_subagent tool',
        pattern: /spawn_subagent tool/i,
      },
    ];

    it.each(conventionsExpectations)('%s', ({ pattern }) => {
      expect(conventions).toMatch(pattern);
    });
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

  describe('router manager', () => {
    it.each(managerExpectations)('%s', ({ pattern }) => {
      expect(manager).toMatch(pattern);
    });
  });
});
