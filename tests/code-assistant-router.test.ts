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

  it('router manager enforces continuous delegation until completion', () => {
    expect(manager).toMatch(/Continue delegating via spawn_subagent until the feature is complete/i);
  });

  it('router manager allows rerouting after quality gate failures', () => {
    expect(manager).toMatch(/If a quality_gate blocks progress, route back to red, green, or refactor as needed\./i);
  });
});
