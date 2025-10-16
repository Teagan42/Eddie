import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Workspace = {
  name: string;
  dir: string;
};

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function readPackageJson(path: string) {
  const content = await fs.readFile(path, 'utf8');
  return JSON.parse(content) as { name?: string; scripts?: Record<string, string>; workspaces?: string[] };
}

async function resolveWorkspaceDirs(pattern: string): Promise<string[]> {
  const segments = pattern.split('/');
  const joinRelativePath = (base: string, segment: string) => (base ? join(base, segment) : segment);

  async function expand(relativeDir: string, index: number): Promise<string[]> {
    if (index === segments.length) {
      return relativeDir ? [relativeDir] : [];
    }

    const segment = segments[index];

    if (segment === '*') {
      const base = relativeDir ? join(rootDir, relativeDir) : rootDir;

      try {
        const entries = await fs.readdir(base, { withFileTypes: true });
        const results: string[] = [];

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const expanded = await expand(joinRelativePath(relativeDir, entry.name), index + 1);
          results.push(...expanded);
        }

        return results;
      } catch {
        return [];
      }
    }

    return expand(joinRelativePath(relativeDir, segment), index + 1);
  }

  return expand('', 0);
}

export async function discoverWorkspacesWithScript(scriptName: string): Promise<Workspace[]> {
  const rootPackageJson = await readPackageJson(join(rootDir, 'package.json'));
  const patterns = rootPackageJson.workspaces ?? [];
  const workspaceDirs = new Set<string>();

  for (const pattern of patterns) {
    const dirs = await resolveWorkspaceDirs(pattern);
    dirs.forEach((dir) => workspaceDirs.add(dir));
  }

  const workspaces: Workspace[] = [];

  for (const dir of workspaceDirs) {
    try {
      const pkg = await readPackageJson(join(rootDir, dir, 'package.json'));

      if (pkg.scripts?.[scriptName]) {
        workspaces.push({
          name: pkg.name ?? dir,
          dir,
        });
      }
    } catch {
      // Ignore directories that do not contain a package.json
    }
  }

  return workspaces.sort((a, b) => a.name.localeCompare(b.name));
}
