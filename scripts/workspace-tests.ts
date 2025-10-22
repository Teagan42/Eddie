import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { determineConcurrency, runWithConcurrency } from './utils/workspace-concurrency';
import { formatPrefix, pipeStream } from './utils/workspace-io';
import { discoverWorkspacesWithScript, type Workspace } from './utils/workspaces';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export type TestRunnerOptions = {
  forwardedArgs: string[];
  concurrencyOverride?: number;
};

export function normalizeTestRunnerOptions(rawArgs: string[]): TestRunnerOptions {
  const forwardedArgs: string[] = [];
  let concurrencyOverride: number | undefined;

  for (const arg of rawArgs) {
    if (arg === '--runInBand') {
      concurrencyOverride = 1;
      continue;
    }

    forwardedArgs.push(arg);
  }

  return { forwardedArgs, concurrencyOverride };
}

const { forwardedArgs, concurrencyOverride } = normalizeTestRunnerOptions(process.argv.slice(2));

type TestResult = {
  workspace: string;
  code: number;
  signal?: NodeJS.Signals;
};

export function createTestResult(
  workspace: string,
  code: number | null,
  signal: NodeJS.Signals | null,
): TestResult {
  let normalizedCode = typeof code === 'number' ? code : 0;

  if (signal) {
    if (normalizedCode === 0) {
      normalizedCode = 1;
    }

    return { workspace, code: normalizedCode, signal };
  }

  return { workspace, code: normalizedCode };
}

const activeChildren = new Set<ReturnType<typeof spawn>>();

process.once('SIGINT', () => {
  for (const child of activeChildren) {
    child.kill('SIGINT');
  }
  process.exit(1);
});

async function runWorkspaceTest(
  workspace: Workspace,
  prefixWidth: number,
  forwardedArgs: string[],
): Promise<TestResult> {
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

    child.on('close', (code, signal) => {
      activeChildren.delete(child);
      resolve(createTestResult(workspace.name, code, signal));
    });

    child.on('error', () => {
      activeChildren.delete(child);
      resolve({ workspace: workspace.name, code: 1 });
    });
  });
}

async function main() {
  const workspaces = await discoverWorkspacesWithScript('test');

  if (workspaces.length === 0) {
    console.log('No workspace tests found.');
    return;
  }

  const prefixWidth = workspaces.reduce((width, workspace) => Math.max(width, workspace.name.length), 0);

  const concurrency = concurrencyOverride ?? determineConcurrency(workspaces.length);

  console.log(`Running tests for ${workspaces.length} workspaces in parallel (concurrency ${concurrency})...`);

  const results = await runWithConcurrency(
    workspaces.map((workspace) => () => runWorkspaceTest(workspace, prefixWidth, forwardedArgs)),
    concurrency,
  );

  const failed = results.filter((result) => result.code !== 0);

  if (failed.length > 0) {
    console.error('\nTest failures detected:');
    failed.forEach((result) => {
      const signalInfo = result.signal ? `, signal ${result.signal}` : '';
      console.error(` - ${result.workspace} (exit code ${result.code}${signalInfo})`);
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
