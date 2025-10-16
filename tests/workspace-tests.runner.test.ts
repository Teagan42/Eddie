import { describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import { promises as fs, Dirent } from 'node:fs';
import { join } from 'node:path';
import { runWithConcurrency, determineConcurrency } from '../scripts/utils/workspace-concurrency';
import { discoverWorkspacesWithScript } from '../scripts/utils/workspaces';
import { createTestResult } from '../scripts/workspace-tests';

describe('workspace test runner concurrency', () => {
  it('does not exceed the requested concurrency', async () => {
    const activeCounts: number[] = [];
    let active = 0;
    const tasks = Array.from({ length: 6 }, (_, index) => async () => {
      active += 1;
      activeCounts.push(active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return index;
    });

    const results = await runWithConcurrency(tasks, 2);

    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Math.max(...activeCounts)).toBeLessThanOrEqual(2);
  });

  it('caps default concurrency to three workers', () => {
    const previous = process.env.WORKSPACE_TEST_CONCURRENCY;
    delete process.env.WORKSPACE_TEST_CONCURRENCY;

    const cpuSpy = vi
      .spyOn(os, 'cpus')
      .mockReturnValue(
        Array.from({ length: 8 }, () => ({
          model: 'test',
          speed: 0,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        })),
      );

    try {
      expect(determineConcurrency(10)).toBe(3);
    } finally {
      cpuSpy.mockRestore();

      if (previous !== undefined) {
        process.env.WORKSPACE_TEST_CONCURRENCY = previous;
      } else {
        delete process.env.WORKSPACE_TEST_CONCURRENCY;
      }
    }
  });

  it('treats signaled processes as failures', () => {
    const result = createTestResult('example', null, 'SIGTERM');

    expect(result.code).toBe(1);
    expect(result.signal).toBe('SIGTERM');
  });

  it('preserves non-zero exit codes alongside signals', () => {
    const result = createTestResult('example', 137, 'SIGKILL');

    expect(result.code).toBe(137);
    expect(result.signal).toBe('SIGKILL');
  });
});

describe('workspace discovery', () => {
  it('returns workspaces that define the requested script', async () => {
    const repoRoot = process.cwd();
    const packageDir = join(repoRoot, 'platform', 'runtime');
    const rootPackagePath = join(repoRoot, 'package.json');
    const packageAPath = join(packageDir, 'pkg-a', 'package.json');
    const packageBPath = join(packageDir, 'pkg-b', 'package.json');

    const readFileSpy = vi.spyOn(fs, 'readFile').mockImplementation(async (path) => {
      switch (path) {
        case rootPackagePath:
          return JSON.stringify({ workspaces: ['platform/runtime/*'] });
        case packageAPath:
          return JSON.stringify({ name: 'pkg-a', scripts: { lint: 'eslint .' } });
        case packageBPath:
          return JSON.stringify({ name: 'pkg-b', scripts: { test: 'vitest' } });
        default:
          throw new Error(`Unexpected readFile path: ${path}`);
      }
    });

    const readdirSpy = vi.spyOn(fs, 'readdir').mockImplementation(async (path) => {
      if (path === packageDir) {
        const directory = (name: string, isDir: boolean): Dirent => ({
          name,
          isDirectory: () => isDir,
        }) as Dirent;

        return [directory('pkg-a', true), directory('pkg-b', true), directory('pkg-c', false)];
      }

      throw new Error(`Unexpected readdir path: ${path}`);
    });

    try {
      const workspaces = await discoverWorkspacesWithScript('lint');

      expect(workspaces).toEqual([
        { name: 'pkg-a', dir: 'platform/runtime/pkg-a' },
      ]);
    } finally {
      readFileSpy.mockRestore();
      readdirSpy.mockRestore();
    }
  });

  it('expands nested workspace globs when discovering workspaces', async () => {
    const repoRoot = process.cwd();
    const rootPackagePath = join(repoRoot, 'package.json');
    const platformDir = join(repoRoot, 'platform');
    const coreDir = join(platformDir, 'core');
    const runtimeDir = join(platformDir, 'runtime');
    const packageAPath = join(coreDir, 'pkg-a', 'package.json');
    const packageBPath = join(runtimeDir, 'pkg-b', 'package.json');

    const readFileSpy = vi.spyOn(fs, 'readFile').mockImplementation(async (path) => {
      switch (path) {
        case rootPackagePath:
          return JSON.stringify({ workspaces: ['platform/*/*'] });
        case packageAPath:
          return JSON.stringify({ name: '@eddie/core-a', scripts: { lint: 'eslint .' } });
        case packageBPath:
          return JSON.stringify({ name: '@eddie/runtime-b', scripts: { lint: 'eslint .' } });
        default:
          throw new Error(`Unexpected readFile path: ${path}`);
      }
    });

    const readdirSpy = vi.spyOn(fs, 'readdir').mockImplementation(async (path) => {
      switch (path) {
        case platformDir: {
          const directory = (name: string): Dirent => ({
            name,
            isDirectory: () => true,
          }) as Dirent;

          const file = (name: string): Dirent => ({
            name,
            isDirectory: () => false,
          }) as Dirent;

          return [directory('core'), directory('runtime'), file('README.md')];
        }
        case coreDir: {
          const directory = (name: string): Dirent => ({
            name,
            isDirectory: () => true,
          }) as Dirent;

          return [directory('pkg-a')];
        }
        case runtimeDir: {
          const directory = (name: string, isDir: boolean): Dirent => ({
            name,
            isDirectory: () => isDir,
          }) as Dirent;

          return [directory('pkg-b', true), directory('notes', false)];
        }
        default:
          throw new Error(`Unexpected readdir path: ${path}`);
      }
    });

    try {
      const workspaces = await discoverWorkspacesWithScript('lint');

      expect(workspaces).toEqual([
        { name: '@eddie/core-a', dir: 'platform/core/pkg-a' },
        { name: '@eddie/runtime-b', dir: 'platform/runtime/pkg-b' },
      ]);
    } finally {
      readFileSpy.mockRestore();
      readdirSpy.mockRestore();
    }
  });
});
