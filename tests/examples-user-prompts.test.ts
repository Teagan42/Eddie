import { describe, expect, it } from 'vitest';

import { read } from './helpers/fs';

const userPromptPaths = [
  'examples/code-assistant/prompts/user.jinja',
  'examples/personal-assistant/prompts/user.jinja',
  'examples/standalone/prompts/user.jinja',
  'examples/subagent/prompts/user.jinja',
  'examples/voice-assistant/prompts/user.jinja',
] as const;

describe('example user prompts', () => {
  it.each(userPromptPaths)('renders prompt variable in %s', (relativePath) => {
    const template = read(relativePath);

    expect(template).toMatch(/{{\s*prompt\b/);
  });
});
