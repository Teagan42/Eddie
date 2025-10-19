import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readmePath = resolve(__dirname, '..', 'README.md');

describe('engine package documentation', () => {
  it('explains CLI execution, transcript compaction, and telemetry', () => {
    expect(existsSync(readmePath)).toBe(true);

    const content = readFileSync(readmePath, 'utf8');

    const requiredSnippets = [
      '# Engine runtime execution guide',
      '## EngineService CLI sequence',
      '## Transcript compaction workflow',
      '## Telemetry and metrics integration',
      'TranscriptCompactionService',
      'MetricsService',
    ];

    for (const snippet of requiredSnippets) {
      expect(content).toContain(snippet);
    }
  });
});
