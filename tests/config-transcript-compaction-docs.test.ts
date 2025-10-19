import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const configurationDocPath = join(repoRoot, 'docs', 'configuration.md');
const doc = readFileSync(configurationDocPath, 'utf8');

const expectDocToMatchAll = (patterns: RegExp[]): void => {
  for (const pattern of patterns) {
    expect(doc).toMatch(pattern);
  }
};

describe('configuration documentation transcript compaction section', () => {
  it('explains the transcript.compactor block with global and agent scopes', () => {
    expectDocToMatchAll([
      /## Transcript Compaction/,
      /transcript\.compactor/,
      /global configuration/i,
      /per-agent override/i,
      /engine reloads compaction strategies/i,
    ]);
  });

  it('documents built-in compaction strategies and their tunable fields', () => {
    expectDocToMatchAll([
      /simple/,
      /summarizer/,
      /token_budget/,
      /intelligent/,
      /maxMessages/,
      /windowSize/,
      /tokenBudget/,
    ]);
  });

  it('provides configuration snippets and observability hooks', () => {
    expectDocToMatchAll([
      /eddie\.config\.(json|yaml)/,
      /observability/,
      /hooks/,
    ]);
  });
});
