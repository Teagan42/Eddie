import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function readApiDoc(): string {
  return readFileSync(join(repoRoot, 'docs/api.md'), 'utf8');
}

describe('api documentation reference examples', () => {
  let apiDoc: string;

  beforeAll(() => {
    apiDoc = readApiDoc();
  });

  it('documents a curl example for the health check route', () => {
    expect(apiDoc).toMatch(/curl\s+http:\/\/localhost:4000\/health/);
  });

  it('shows a websocket subscription example for chat session streams', () => {
    expect(apiDoc).toMatch(/wscat\s+--connect\s+ws:\/\/localhost:4000\/chat-sessions\//);
  });

  it('lists configuration editor endpoints and verbs', () => {
    expect(apiDoc).toMatch(/GET\s+\/config\/schema/);
    expect(apiDoc).toMatch(/GET\s+\/config\/editor/);
    expect(apiDoc).toMatch(/POST\s+\/config\/editor\/preview/);
    expect(apiDoc).toMatch(/PUT\s+\/config\/editor/);
  });

  it('documents provider catalog and user preference routes', () => {
    expect(apiDoc).toMatch(/GET\s+\/providers\/catalog/);
    expect(apiDoc).toMatch(/GET\s+\/user\/preferences\/layout/);
    expect(apiDoc).toMatch(/PUT\s+\/user\/preferences\/layout/);
  });

  it('mentions orchestrator metadata endpoint with optional session query', () => {
    expect(apiDoc).toMatch(/GET\s+\/orchestrator\/metadata/);
    expect(apiDoc).toMatch(/sessionId/);
  });
});
