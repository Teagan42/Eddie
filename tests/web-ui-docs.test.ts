import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const renameDeleteCopy = /rename or delete chat sessions/i;
const sessionDeletedToken = /session\.deleted/;

function readRootFile(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('web ui documentation', () => {
  let webUiDoc: string;

  beforeAll(() => {
    webUiDoc = readRootFile('../docs/web-ui.md');
  });

  it('calls out rename and delete actions with realtime expectations', () => {
    expect(webUiDoc).toMatch(renameDeleteCopy);
    expect(webUiDoc).toMatch(sessionDeletedToken);
  });

  it('cross-links execution tree panel to websocket telemetry sources', () => {
    expect(webUiDoc).toMatch(/execution tree panel/i);
    expect(webUiDoc).toMatch(/execution-tree\.updated/);
    expect(webUiDoc).toMatch(/ExecutionTreeStateStore/);
  });
});
