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
  if (pattern.endsWith('/*')) {
    const baseDir = pattern.slice(0, -2);
    const absoluteBase = join(rootDir, baseDir);

    try {
      const entries = await fs.readdir(absoluteBase, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => join(baseDir, entry.name));
    } catch {
      return [];
    }
  }

  return [pattern];
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
