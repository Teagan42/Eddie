import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

vi.mock('../scripts/utils/workspaces', () => ({
  discoverWorkspacesWithScript: vi.fn().mockResolvedValue([
    { name: '@pkg/a', dir: 'packages/a' },
    { name: '@pkg/b', dir: 'packages/b' },
  ]),
}));

const runWithConcurrencyMock = vi.fn(async (tasks: Array<() => Promise<unknown>>, concurrency: number) => {
  const results = [] as unknown[];

  for (const task of tasks) {
    results.push(await task());
  }

  return results;
});

const determineConcurrencyMock = vi.fn().mockReturnValue(2);

vi.mock('../scripts/utils/workspace-concurrency', () => ({
  runWithConcurrency: runWithConcurrencyMock,
  determineConcurrency: determineConcurrencyMock,
}));

function createChild(): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  // @ts-expect-error partial implementation for tests
  emitter.stdout = new PassThrough();
  // @ts-expect-error partial implementation for tests
  emitter.stderr = new PassThrough();

  queueMicrotask(() => {
    emitter.emit('close', 0, null);
  });

  return emitter;
}

const spawnMock = vi.fn(createChild);

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

const { runWorkspaceScript, parseArguments } = await import('../scripts/workspace-script');

beforeEach(() => {
  runWithConcurrencyMock.mockClear();
  determineConcurrencyMock.mockClear();
  spawnMock.mockClear();
});

describe('workspace script runner', () => {
  it('runs each workspace script using concurrency', async () => {
    await runWorkspaceScript('lint', { forwardedArgs: ['--fix'] });

    expect(determineConcurrencyMock).toHaveBeenCalledWith(2);
    expect(runWithConcurrencyMock).toHaveBeenCalled();

    const [tasks, concurrency] = runWithConcurrencyMock.mock.calls[0];
    expect(tasks).toHaveLength(2);
    expect(concurrency).toBe(2);

    const firstCall = spawnMock.mock.calls[0];
    expect(firstCall[0]).toBe('npm');
    expect(firstCall[1]).toEqual(['run', 'lint', '--workspace', '@pkg/a', '--if-present', '--', '--fix']);
  });
});

describe('argument parsing', () => {
  it('splits forwarded arguments after --', () => {
    const parsed = parseArguments(['node', 'script', 'lint', '--', '--fix', '--cache']);

    expect(parsed).toEqual({ scriptName: 'lint', forwardedArgs: ['--fix', '--cache'] });
  });
});
