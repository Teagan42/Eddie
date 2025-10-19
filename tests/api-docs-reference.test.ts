import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function readApiDoc(): string {
  return readFileSync(join(repoRoot, 'docs/api.md'), 'utf8');
}

function expectAllMatches(source: string, patterns: RegExp[]): void {
  for (const pattern of patterns) {
    expect(source).toMatch(pattern);
  }
}

const executionTreePatterns = [
  /execution-tree\.updated/,
  /ChatSessionsGateway/,
  /ExecutionTreeState/,
  /rootNodeId/,
  /nodes/,
  /edges/,
  /contextBundles/,
  /toolInvocations/,
  /agentHierarchy/,
  /updatedAt/,
];

const orchestratorSnapshotPatterns = [
  /ExecutionTreeStateStore/,
  /contextBundles/,
  /toolInvocations/,
  /agentHierarchy/,
  /capturedAt/,
];

describe('api documentation reference examples', () => {
  let apiDoc: string;
  const renameExamplePayload = '{\n  "name": "Renamed session title"\n}';

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

  it('documents CQRS buses and module boundaries', () => {
    expectAllMatches(apiDoc, [
      /##\s+CQRS\s+buses\s+and\s+module\s+boundaries/i,
      /Command\s+Bus/i,
      /Query\s+Bus/i,
      /Event\s+Bus/i,
      /ChatSessionsModule/,
      /TracesModule/,
      /RuntimeConfigModule/,
      /ToolsModule/,
    ]);
  });

  it('lists CQRS-driven endpoints and websocket topics', () => {
    expectAllMatches(apiDoc, [
      /GET\s+\/config\s+\(runtime config\)/i,
      /PATCH\s+\/config\s+\(runtime config\)/i,
      /GET\s+\/traces/,
      /GET\s+\/traces\/:id/,
      /session\.created/,
      /message\.updated/,
      /config\.updated/,
      /trace\.updated/,
      /message\.send/,
    ]);
  });

  it('cross-links to the ADR and design references for the CQRS refactor', () => {
    expectAllMatches(apiDoc, [
      /docs\/adr\//,
      /migration\/api-cqrs-design\.md/,
      /migration\/api-cqrs-guidelines\.md/,
      /migration\/api-realtime-events\.md/,
    ]);
  });

  it('mentions orchestrator metadata endpoint with optional session query', () => {
    expect(apiDoc).toMatch(/GET\s+\/orchestrator\/metadata/);
    expect(apiDoc).toMatch(/sessionId/);
  });

  it('documents execution tree websocket snapshots and payload fields', () => {
    expectAllMatches(apiDoc, executionTreePatterns);
    expect(apiDoc).toMatch(/"event"\s*:\s*"execution-tree\.updated"/);
    expect(apiDoc).toMatch(/"payload"\s*:\s*\{/);
  });

  it('explains orchestrator metadata snapshots sourced from execution tree state', () => {
    expectAllMatches(apiDoc, orchestratorSnapshotPatterns);
    expect(apiDoc).toMatch(/GET\s+\/orchestrator\/metadata[\s\S]+example\s+response/);
  });

  it('documents chat session rename and delete routes with responses', () => {
    expect(apiDoc).toMatch(/PATCH\s+\/chat-sessions\/:id(?!\/archive)/);
    expect(apiDoc).toContain(renameExamplePayload);
    expect(apiDoc).toMatch(/responds\s+with\s+200\s+OK/);
    expect(apiDoc).toMatch(/DELETE\s+\/chat-sessions\/:id/);
    expect(apiDoc).toMatch(/returns\s+a\s+204\s+No\s+Content/);
  });

  it('covers real-time session.deleted events for websocket consumers', () => {
    expect(apiDoc).toMatch(/session\.deleted/);
    expect(apiDoc).toMatch(/clients\s+should\s+drop\s+local\s+copies/);
  });

  it('details persistence configuration for sql drivers', () => {
    for (const driver of ["sqlite", "postgres", "mysql", "mariadb"]) {
      expect(apiDoc).toMatch(new RegExp(String.raw`driver:\s+${driver}`));
    }

    for (const token of ["PGHOST", "MYSQL_HOST", "MARIADB_HOST"]) {
      expect(apiDoc).toContain(token);
    }

    expect(apiDoc).toMatch(/runs pending migrations automatically/i);
  });
});
