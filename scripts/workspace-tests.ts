import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

type Workspace = {
  name: string;
  dir: string;
};

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const forwardedArgs = process.argv.slice(2);

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

async function discoverWorkspaces(): Promise<Workspace[]> {
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
      if (pkg.scripts?.test) {
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

function formatPrefix(name: string, width: number): string {
  const padded = name.padEnd(width, ' ');
  return `[${padded}]`;
}

type TestResult = {
  workspace: string;
  code: number;
};

const activeChildren = new Set<ReturnType<typeof spawn>>();

function pipeStream(stream: NodeJS.ReadableStream, writer: NodeJS.WritableStream, prefix: string) {
  const rl = createInterface({ input: stream });
  rl.on('line', (line) => {
    writer.write(`${prefix} ${line}\n`);
  });
}

function parsePositiveInteger(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

process.once('SIGINT', () => {
  for (const child of activeChildren) {
    child.kill('SIGINT');
  }
  process.exit(1);
});

async function runWorkspaceTest(workspace: Workspace, prefixWidth: number): Promise<TestResult> {
  const prefix = formatPrefix(workspace.name, prefixWidth);
  const args = ['run', 'test', '--workspace', workspace.name, '--if-present'];

  if (forwardedArgs.length > 0) {
    args.push('--', ...forwardedArgs);
  }

  return new Promise((resolve) => {
    const child = spawn('npm', args, {
      cwd: rootDir,
      env: { ...process.env },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    activeChildren.add(child);

    pipeStream(child.stdout, process.stdout, prefix);
    pipeStream(child.stderr, process.stderr, prefix);

    child.on('close', (code) => {
      activeChildren.delete(child);
      resolve({ workspace: workspace.name, code: code ?? 0 });
    });

    child.on('error', () => {
      activeChildren.delete(child);
      resolve({ workspace: workspace.name, code: 1 });
    });
  });
}

export async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive integer.');
  }

  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;
  let firstError: unknown;
  const workerCount = Math.min(concurrency, tasks.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (firstError) {
        return;
      }

      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= tasks.length) {
        return;
      }

      try {
        results[currentIndex] = await tasks[currentIndex]();
      } catch (error) {
        firstError = error;
      }
    }
  });

  await Promise.all(workers);

  if (firstError) {
    throw firstError;
  }

  return results;
}

export function determineConcurrency(totalWorkspaces: number): number {
  if (totalWorkspaces <= 0) {
    return 0;
  }

  const parsedEnv = parsePositiveInteger(process.env.WORKSPACE_TEST_CONCURRENCY);
  if (parsedEnv) {
    return Math.min(parsedEnv, totalWorkspaces);
  }

  const cpuCount = os.cpus()?.length ?? 1;
  const recommended = Math.min(2, cpuCount);
  return Math.min(recommended, totalWorkspaces);
}

async function main() {
  const workspaces = await discoverWorkspaces();

  if (workspaces.length === 0) {
    console.log('No workspace tests found.');
    return;
  }

  const prefixWidth = workspaces.reduce((width, workspace) => Math.max(width, workspace.name.length), 0);

  const concurrency = determineConcurrency(workspaces.length);

  console.log(`Running tests for ${workspaces.length} workspaces in parallel (concurrency ${concurrency})...`);

  const results = await runWithConcurrency(
    workspaces.map((workspace) => () => runWorkspaceTest(workspace, prefixWidth)),
    concurrency,
  );

  const failed = results.filter((result) => result.code !== 0);

  if (failed.length > 0) {
    console.error('\nTest failures detected:');
    failed.forEach((result) => {
      console.error(` - ${result.workspace} (exit code ${result.code})`);
    });
    process.exit(1);
  }

  console.log('\nAll workspace tests completed successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
