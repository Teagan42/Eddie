import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

vi.mock('../scripts/utils/workspaces', () => ({
  discoverWorkspacesWithScript: vi.fn().mockResolvedValue([
    { name: '@pkg/changed-low', dir: 'platform/runtime/changed-low', testFileCount: 2, hasChanges: true },
    { name: '@pkg/unchanged-low', dir: 'platform/runtime/unchanged-low', testFileCount: 1, hasChanges: false },
    { name: '@pkg/unchanged-high', dir: 'platform/runtime/unchanged-high', testFileCount: 10, hasChanges: false },
    { name: '@pkg/changed-high', dir: 'platform/runtime/changed-high', testFileCount: 10, hasChanges: true },
    { name: '@pkg/massive', dir: 'platform/runtime/massive', testFileCount: 30, hasChanges: false },
  ]),
  prioritizeWorkspaces: (workspaces: Array<{ testFileCount: number; hasChanges: boolean; name: string }>) =>
    [...workspaces].sort((a, b) => {
      if (b.testFileCount !== a.testFileCount) {
        return b.testFileCount - a.testFileCount;
      }

      if (a.hasChanges !== b.hasChanges) {
        return a.hasChanges ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    }),
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

    expect(determineConcurrencyMock).toHaveBeenCalledWith(5);
    expect(runWithConcurrencyMock).toHaveBeenCalled();

    const [tasks, concurrency] = runWithConcurrencyMock.mock.calls[0];
    expect(tasks).toHaveLength(5);
    expect(concurrency).toBe(2);

    const spawnWorkspaceOrder = spawnMock.mock.calls.map((call) => call[1][3]);
    expect(spawnWorkspaceOrder).toEqual([
      '@pkg/massive',
      '@pkg/changed-high',
      '@pkg/unchanged-high',
      '@pkg/changed-low',
      '@pkg/unchanged-low',
    ]);
  });
});

describe('argument parsing', () => {
  it('splits forwarded arguments after --', () => {
    const parsed = parseArguments(['node', 'script', 'lint', '--', '--fix', '--cache']);

    expect(parsed).toEqual({ scriptName: 'lint', forwardedArgs: ['--fix', '--cache'] });
  });
});
