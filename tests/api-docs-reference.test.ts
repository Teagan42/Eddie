import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function readApiDoc(): string {
  return readFileSync(join(repoRoot, 'docs/api.md'), 'utf8');
}

describe('api documentation reference examples', () => {
  it('documents a curl example for the health check route', () => {
    expect(readApiDoc()).toMatch(/curl\s+http:\/\/localhost:4000\/health/);
  });

  it('shows a websocket subscription example for chat session streams', () => {
    expect(readApiDoc()).toMatch(/wscat\s+--connect\s+ws:\/\/localhost:4000\/chat-sessions\//);
  });
});
