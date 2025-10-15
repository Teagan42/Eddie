import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type CoverageExpectation = {
  name: string;
  checks: Array<RegExp | string>;
};

function readRootFile(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const coverageExpectations: CoverageExpectation[] = [
  {
    name: 'documents prerequisites for Node and system dependencies',
    checks: ['## Prerequisites', /Node\.js 20/, /system dependenc/i],
  },
  {
    name: 'guides cloning, installing, and building the repo',
    checks: [/## Initial Setup/i, /git clone/, /npm install/, /npm run build/],
  },
  {
    name: 'covers running CLI, API, and Web surfaces',
    checks: [/## Running Surfaces/i, /CLI/, /API/, /Web/],
  },
  {
    name: 'outlines database setup for API development',
    checks: [/## Database Setup for API Development/i, /database/i, /migration/i],
  },
  {
    name: 'shares debugging configuration for VS Code and other IDEs',
    checks: [/## Debugging Configuration/i, /VS Code/, /IDE/],
  },
  {
    name: 'lists common troubleshooting scenarios',
    checks: [/## Troubleshooting/i, /common/i, /issue/i],
  },
  {
    name: 'explains hot reload and watch modes',
    checks: [/## Hot Reload and Watch Modes/i, /hot reload/i, /watch/i],
  },
];

describe('Contributing guide', () => {
  let guide: string;

  beforeAll(() => {
    guide = readRootFile('../docs/CONTRIBUTING.md');
  });

  it.each(coverageExpectations)('%s', ({ checks }) => {
    for (const pattern of checks) {
      if (typeof pattern === 'string') {
        expect(guide).toContain(pattern);
        continue;
      }

      expect(guide).toMatch(pattern);
    }
  });
});
