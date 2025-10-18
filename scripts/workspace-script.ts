import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { determineConcurrency, runWithConcurrency } from './utils/workspace-concurrency';
import { formatPrefix, pipeStream } from './utils/workspace-io';
import {
  discoverWorkspacesWithScript,
  prioritizeWorkspaces,
  type Workspace,
} from './utils/workspaces';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const activeChildren = new Set<ChildProcess>();

process.once('SIGINT', () => {
  for (const child of activeChildren) {
    child.kill('SIGINT');
  }
  process.exit(1);
});

type CommandResult = {
  workspace: string;
  code: number;
  signal?: NodeJS.Signals;
};

function createCommandResult(workspace: string, code: number | null, signal: NodeJS.Signals | null): CommandResult {
  let normalizedCode = typeof code === 'number' ? code : 0;

  if (signal) {
    if (normalizedCode === 0) {
      normalizedCode = 1;
    }

    return { workspace, code: normalizedCode, signal };
  }

  return { workspace, code: normalizedCode };
}

async function runWorkspaceCommand(
  scriptName: string,
  workspace: Workspace,
  prefixWidth: number,
  forwardedArgs: string[],
  spawnImpl: typeof spawn,
): Promise<CommandResult> {
  const prefix = formatPrefix(workspace.name, prefixWidth);
  const args = ['run', scriptName, '--workspace', workspace.name, '--if-present'];

  if (forwardedArgs.length > 0) {
    args.push('--', ...forwardedArgs);
  }

  return new Promise((resolve) => {
    const child = spawnImpl('npm', args, {
      cwd: rootDir,
      env: { ...process.env },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    activeChildren.add(child);

    pipeStream(child.stdout ?? undefined, process.stdout, prefix);
    pipeStream(child.stderr ?? undefined, process.stderr, prefix);

    child.on('close', (code, signal) => {
      activeChildren.delete(child);
      resolve(createCommandResult(workspace.name, code, signal));
    });

    child.on('error', () => {
      activeChildren.delete(child);
      resolve({ workspace: workspace.name, code: 1 });
    });
  });
}

export async function runWorkspaceScript(
  scriptName: string,
  options?: { forwardedArgs?: string[]; spawn?: typeof spawn },
): Promise<CommandResult[]> {
  const forwardedArgs = options?.forwardedArgs ?? [];
  const spawnImpl = options?.spawn ?? spawn;

  const workspaces = await discoverWorkspacesWithScript(scriptName);

  if (workspaces.length === 0) {
    console.log(`No workspaces define the "${scriptName}" script.`);
    return [];
  }

  const prioritizedWorkspaces = prioritizeWorkspaces(workspaces);
  const prefixWidth = prioritizedWorkspaces.reduce(
    (width, workspace) => Math.max(width, workspace.name.length),
    0,
  );
  const concurrency = determineConcurrency(prioritizedWorkspaces.length);

  console.log(
    `Running "${scriptName}" in ${prioritizedWorkspaces.length} workspaces (concurrency ${concurrency})...`,
  );

  return runWithConcurrency(
    prioritizedWorkspaces.map((workspace) => () =>
      runWorkspaceCommand(scriptName, workspace, prefixWidth, forwardedArgs, spawnImpl),
    ),
    concurrency,
  );
}

export function parseArguments(argv: string[]): { scriptName: string | undefined; forwardedArgs: string[] } {
  const [, , scriptName, ...rest] = argv;

  if (!scriptName) {
    return { scriptName: undefined, forwardedArgs: [] };
  }

  const separatorIndex = rest.indexOf('--');
  if (separatorIndex === -1) {
    return { scriptName, forwardedArgs: rest };
  }

  const forwardedArgs = rest.slice(separatorIndex + 1);
  return { scriptName, forwardedArgs };
}

async function main() {
  const { scriptName, forwardedArgs } = parseArguments(process.argv);

  if (!scriptName) {
    console.error('Usage: tsx scripts/workspace-script.ts <script> [-- <args>...]');
    process.exit(1);
  }

  try {
    const results = await runWorkspaceScript(scriptName, { forwardedArgs });
    const failed = results.filter((result) => result.code !== 0);

    if (failed.length > 0) {
      console.error(`\nScript "${scriptName}" failed in the following workspaces:`);
      failed.forEach((result) => {
        const signalInfo = result.signal ? `, signal ${result.signal}` : '';
        console.error(` - ${result.workspace} (exit code ${result.code}${signalInfo})`);
      });
      process.exit(1);
    }

    console.log(`\nScript "${scriptName}" completed successfully across all workspaces.`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
