import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const read = (relativePath: string) => readFileSync(join(repoRoot, relativePath), 'utf8');

const conventionsPath = 'examples/code-assistant/prompts/partials/conventions.jinja';
const routerManagerPath = 'examples/code-assistant/prompts/router_manager.jinja';

describe('code assistant prompt guidance', () => {
  const conventions = read(conventionsPath);
  const routerInstructions = read(routerManagerPath);

  it('conventions partial defers spawn_subagent instructions to the dedicated reference', () => {
    expect(conventions).not.toMatch(/spawn_subagent/);
  });

  it('router manager instructs continuous delegation until the feature is complete', () => {
    expect(routerInstructions).toContain('Continue invoking spawn_subagent until the acceptance criteria are satisfied');
  });

  it('router manager describes routing options after a quality gate failure', () => {
    expect(routerInstructions).toMatch(/quality_gate[^\n]+red, green, or refactor/i);
  });
});
