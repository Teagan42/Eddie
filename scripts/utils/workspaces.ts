import { execFile } from 'node:child_process';
import { promises as fs, type Dirent } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export type Workspace = {
  name: string;
  dir: string;
  testFileCount: number;
  hasChanges: boolean;
};

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const execFileAsync = promisify(execFile);
const TEST_FILE_PATTERN = /\.(?:spec|test)\.[^.]+$/;
const TEST_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.cts',
  '.mts',
  '.jsx',
  '.tsx',
]);
const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.turbo',
  '.next',
  '.git',
  'tmp',
  '.cache',
  'build',
]);

type WorkspaceBase = {
  name: string;
  dir: string;
};

type PackageMetadata = {
  name?: string;
  scripts?: Record<string, string>;
  workspaces?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

const toPosixPath = (value: string): string => value.replace(/\\/g, '/');

const isTestFile = (filePath: string): boolean => {
  if (TEST_FILE_PATTERN.test(filePath)) {
    return true;
  }

  if (filePath.includes('/__tests__/')) {
    const extension = extname(filePath);
    return TEST_EXTENSIONS.has(extension);
  }

  return false;
};

const countTestFiles = async (workspaceDir: string): Promise<number> => {
  const absoluteDir = join(rootDir, workspaceDir);
  let count = 0;

  const visit = async (currentDir: string): Promise<void> => {
    let entries: Dirent[];

    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        await visit(join(currentDir, entry.name));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const filePath = toPosixPath(join(currentDir, entry.name));

      if (isTestFile(filePath)) {
        count += 1;
      }
    }
  };

  await visit(absoluteDir);
  return count;
};

const parseChangedWorkspaceEnv = (): Set<string> | undefined => {
  const raw = process.env.CHANGED_WORKSPACES;

  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      const result = new Set<string>();

      for (const value of parsed) {
        if (typeof value === 'string' && value.length > 0) {
          result.add(value);
        }
      }

      return result;
    }
  } catch {
    // Fall back to comma-separated parsing
  }

  const values = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (values.length === 0) {
    return undefined;
  }

  return new Set(values);
};

const parseChangedPath = (line: string): string | undefined => {
  if (line.length < 4) {
    return undefined;
  }

  const content = line.slice(3).trim();

  if (content.length === 0) {
    return undefined;
  }

  if (content.includes(' -> ')) {
    const segments = content.split(' -> ');
    return segments[segments.length - 1];
  }

  return content;
};

const parseDiffChangedPath = (line: string): string | undefined => {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.includes(' -> ')) {
    const segments = trimmed.split(' -> ');
    return segments[segments.length - 1];
  }

  return trimmed;
};

const collectChangedPaths = (stdout: string, parser: (line: string) => string | undefined): string[] =>
  stdout
    .split('\n')
    .map((line) => parser(line))
    .filter((value): value is string => Boolean(value))
    .map(toPosixPath);

const gatherChangedPaths = async (diffBase?: string): Promise<Set<string>> => {
  const changedPaths = new Set<string>();

  if (diffBase) {
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--name-only', `${diffBase}...HEAD`]);
      for (const path of collectChangedPaths(stdout, parseDiffChangedPath)) {
        changedPaths.add(path);
      }
    } catch {
      // Ignore diff failures and fall back to status output
    }
  }

  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain']);
    for (const path of collectChangedPaths(stdout, parseChangedPath)) {
      changedPaths.add(path);
    }
  } catch {
    if (changedPaths.size === 0) {
      return new Set();
    }
  }

  return changedPaths;
};

const buildDependentsByDependency = async (
  workspaces: WorkspaceBase[],
): Promise<Map<string, Set<string>>> => {
  const dependentsByDependency = new Map<string, Set<string>>();

  await Promise.all(
    workspaces.map(async (workspace) => {
      try {
        const packageJson = await readPackageJson(
          join(rootDir, workspace.dir, 'package.json'),
        );

        for (const field of DEPENDENCY_FIELDS) {
          const dependencies = packageJson[field];

          if (!dependencies) {
            continue;
          }

          for (const dependencyName of Object.keys(dependencies)) {
            let dependents = dependentsByDependency.get(dependencyName);

            if (!dependents) {
              dependents = new Set<string>();
              dependentsByDependency.set(dependencyName, dependents);
            }

            dependents.add(workspace.name);
          }
        }
      } catch {
        // Ignore missing package metadata when building dependency graph
      }
    }),
  );

  return dependentsByDependency;
};

const expandChangedWorkspaces = async (
  workspaces: WorkspaceBase[],
  initial: Set<string>,
): Promise<Set<string>> => {
  if (initial.size === 0) {
    return new Set();
  }

  const result = new Set(initial);
  const dependentsByDependency = await buildDependentsByDependency(workspaces);

  if (dependentsByDependency.size === 0) {
    return result;
  }

  const queue = [...result];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    const dependents = dependentsByDependency.get(current);

    if (!dependents) {
      continue;
    }

    for (const dependent of dependents) {
      if (result.has(dependent)) {
        continue;
      }

      result.add(dependent);
      queue.push(dependent);
    }
  }

  return result;
};

const discoverChangedWorkspaces = async (
  workspaces: WorkspaceBase[],
): Promise<Set<string>> => {
  const fromEnv = parseChangedWorkspaceEnv();

  if (fromEnv) {
    return expandChangedWorkspaces(workspaces, fromEnv);
  }

  const diffBase = process.env.WORKSPACE_DIFF_BASE?.trim();
  const changedPaths = await gatherChangedPaths(diffBase);

  if (changedPaths.size === 0) {
    return new Set();
  }

  const changedWorkspaces = new Set<string>();

  for (const workspace of workspaces) {
    const workspaceDir = toPosixPath(workspace.dir);

    for (const changedPath of changedPaths) {
      if (changedPath === workspaceDir || changedPath.startsWith(`${workspaceDir}/`)) {
        changedWorkspaces.add(workspace.name);
        break;
      }
    }
  }

  if (changedWorkspaces.size === 0) {
    return changedWorkspaces;
  }

  return expandChangedWorkspaces(workspaces, changedWorkspaces);
};

export const prioritizeWorkspaces = (workspaces: Workspace[]): Workspace[] =>
  [...workspaces].sort((a, b) => {
    if (b.testFileCount !== a.testFileCount) {
      return b.testFileCount - a.testFileCount;
    }

    if (a.hasChanges !== b.hasChanges) {
      return a.hasChanges ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });

async function readPackageJson(path: string) {
  const content = await fs.readFile(path, 'utf8');
  return JSON.parse(content) as PackageMetadata;
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

  const workspaces: WorkspaceBase[] = [];

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

  const changedWorkspaces = await discoverChangedWorkspaces(workspaces);

  const workspaceDetails = await Promise.all(
    workspaces.map(async (workspace) => ({
      ...workspace,
      testFileCount: await countTestFiles(workspace.dir),
      hasChanges: changedWorkspaces.has(workspace.name),
    })),
  );

  return prioritizeWorkspaces(workspaceDetails);
}
