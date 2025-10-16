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

async function listDirectories(absolute: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function resolveWorkspaceDirs(pattern: string): Promise<string[]> {
  if (!pattern.includes('*')) {
    return [pattern];
  }

  const segments = pattern.split('/');
  const results: string[] = [];

  async function traverse(index: number, absolute: string, parts: string[]): Promise<void> {
    if (index >= segments.length) {
      if (parts.length > 0) {
        results.push(parts.join('/'));
      }
      return;
    }

    const segment = segments[index];

    if (segment === '*') {
      const directories = await listDirectories(absolute);

      await Promise.all(
        directories.map((name) => traverse(index + 1, join(absolute, name), [...parts, name])),
      );

      return;
    }

    if (segment === '**') {
      await traverse(index + 1, absolute, parts);

      const directories = await listDirectories(absolute);

      await Promise.all(
        directories.map((name) => traverse(index, join(absolute, name), [...parts, name])),
      );

      return;
    }

    const nextAbsolute = join(absolute, segment);

    try {
      const stat = await fs.stat(nextAbsolute);
      if (!stat.isDirectory()) {
        return;
      }
    } catch {
      return;
    }

    await traverse(index + 1, nextAbsolute, [...parts, segment]);
  }

  await traverse(0, rootDir, []);

  return results;
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
