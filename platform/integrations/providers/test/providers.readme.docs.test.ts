import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('providers README documentation', () => {
  it('documents adapters, response formats, and notification semantics', () => {
    const readmePath = resolve(__dirname, '..', 'README.md');
    const readmeContents = readFileSync(readmePath, 'utf8');

    expect(readmeContents).toContain('## Available adapters');

    const requiredFragments = [
      /OpenAI/,
      /Anthropic/,
      /OpenAI-compatible/,
      /Ollama/,
      /ProviderFactoryService/,
      /resolveResponseFormat/,
      /tool schemas?/i,
      /extractNotificationEvents/,
      /StreamEvent/,
      /metadata/,
      /no-?op/i,
    ];

    for (const fragment of requiredFragments) {
      expect(readmeContents).toMatch(fragment);
    }
  });
});
