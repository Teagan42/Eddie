import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type CiWorkspace = {
  path: string;
};

type Lockfile = {
  packages: Record<string, { workspaces?: string[] }>;
};

const expectedWorkspaceGlobs = ['apps/*', 'platform/*/*'] as const;

const readJson = <T>(relativePath: string): T => {
  const content = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  return JSON.parse(content) as T;
};

describe('workspace configuration', () => {
  it('shares a single platform glob across tooling', () => {
    const rootPackage = readJson<{ workspaces?: string[] }>('../package.json');
    const lockfile = readJson<Lockfile>('../package-lock.json');
    const ciWorkspaces = readJson<CiWorkspace[]>('../platform/testing/ci-support/workspaces.json');

    expect(rootPackage.workspaces).toEqual(expectedWorkspaceGlobs);
    expect(lockfile.packages['']?.workspaces).toEqual(expectedWorkspaceGlobs);

    const legacyCiPaths = ciWorkspaces.filter((workspace) => workspace.path.startsWith('packages/'));
    expect(legacyCiPaths).toEqual([]);
  });
});
