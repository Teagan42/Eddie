import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs, Dirent } from 'node:fs';
import { join } from 'node:path';

const createDirectory = (name: string): Dirent => ({
  name,
  isDirectory: () => true,
  isFile: () => false,
}) as Dirent;

describe('discoverChangedWorkspaces', () => {
  afterEach(() => {
    delete process.env.CHANGED_WORKSPACES;
    delete process.env.WORKSPACE_DIFF_BASE;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('marks dependents of changed workspaces as having changes', async () => {
    process.env.CHANGED_WORKSPACES = JSON.stringify(['pkg-a']);
    vi.resetModules();

    const { discoverWorkspacesWithScript } = await import('../scripts/utils/workspaces');

    const repoRoot = process.cwd();
    const runtimeDir = join(repoRoot, 'platform', 'runtime');
    const pkgADir = join(runtimeDir, 'pkg-a');
    const pkgBDir = join(runtimeDir, 'pkg-b');
    const rootPackagePath = join(repoRoot, 'package.json');
    const pkgAPath = join(pkgADir, 'package.json');
    const pkgBPath = join(pkgBDir, 'package.json');

    const readFileSpy = vi.spyOn(fs, 'readFile').mockImplementation(async (path) => {
      switch (path) {
        case rootPackagePath:
          return JSON.stringify({ workspaces: ['platform/runtime/*'] });
        case pkgAPath:
          return JSON.stringify({ name: 'pkg-a', scripts: { lint: 'eslint .' } });
        case pkgBPath:
          return JSON.stringify({
            name: 'pkg-b',
            scripts: { lint: 'eslint .' },
            dependencies: { 'pkg-a': 'workspace:*' },
          });
        default:
          throw new Error(`Unexpected readFile path: ${path}`);
      }
    });

    const readdirSpy = vi.spyOn(fs, 'readdir').mockImplementation(async (path, options) => {
      if (!options || options.withFileTypes !== true) {
        throw new Error('Expected directory entries request');
      }

      switch (path) {
        case runtimeDir:
          return [createDirectory('pkg-a'), createDirectory('pkg-b')];
        case pkgADir:
        case pkgBDir:
          return [];
        default:
          throw new Error(`Unexpected readdir path: ${path}`);
      }
    });

    try {
      const workspaces = await discoverWorkspacesWithScript('lint');

      expect(workspaces).toEqual([
        {
          name: 'pkg-a',
          dir: 'platform/runtime/pkg-a',
          testFileCount: 0,
          hasChanges: true,
        },
        {
          name: 'pkg-b',
          dir: 'platform/runtime/pkg-b',
          testFileCount: 0,
          hasChanges: true,
        },
      ]);
    } finally {
      readFileSpy.mockRestore();
      readdirSpy.mockRestore();
    }
  });

  it('detects changed workspaces using WORKSPACE_DIFF_BASE', async () => {
    process.env.WORKSPACE_DIFF_BASE = 'origin/main';
    vi.resetModules();

    let diffCalled = false;

    await vi.doMock('node:child_process', async () => {
      const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
      const stdout = 'platform/runtime/pkg-b/src/index.ts\n';

      const execFileMock = vi.fn((...args: unknown[]) => {
        const callback = args[args.length - 1];
        const gitArgs = Array.isArray(args[1]) ? (args[1] as string[]) : undefined;

        if (Array.isArray(gitArgs) && gitArgs[0] === 'diff') {
          diffCalled = true;
        }

        if (typeof callback === 'function') {
          callback(null, stdout, '');
        }

        return {} as unknown;
      });

      (execFileMock as unknown as Record<PropertyKey, unknown>)[
        Symbol.for('nodejs.util.promisify.custom')
      ] = (...args: unknown[]) => {
        const gitArgs = Array.isArray(args[1]) ? (args[1] as string[]) : undefined;

        if (Array.isArray(gitArgs) && gitArgs[0] === 'diff') {
          diffCalled = true;
        }

        return Promise.resolve({ stdout, stderr: '' });
      };

      return {
        ...actual,
        execFile: execFileMock,
      };
    });

    const childProcessModule = await import('node:child_process');
    const { discoverWorkspacesWithScript } = await import('../scripts/utils/workspaces');

    const repoRoot = process.cwd();
    const runtimeDir = join(repoRoot, 'platform', 'runtime');
    const pkgADir = join(runtimeDir, 'pkg-a');
    const pkgBDir = join(runtimeDir, 'pkg-b');
    const rootPackagePath = join(repoRoot, 'package.json');
    const pkgAPath = join(pkgADir, 'package.json');
    const pkgBPath = join(pkgBDir, 'package.json');

    const readFileSpy = vi.spyOn(fs, 'readFile').mockImplementation(async (path) => {
      switch (path) {
        case rootPackagePath:
          return JSON.stringify({ workspaces: ['platform/runtime/*'] });
        case pkgAPath:
          return JSON.stringify({ name: 'pkg-a', scripts: { lint: 'eslint .' } });
        case pkgBPath:
          return JSON.stringify({ name: 'pkg-b', scripts: { lint: 'eslint .' } });
        default:
          throw new Error(`Unexpected readFile path: ${path}`);
      }
    });

    const readdirSpy = vi.spyOn(fs, 'readdir').mockImplementation(async (path, options) => {
      if (!options || options.withFileTypes !== true) {
        throw new Error('Expected directory entries request');
      }

      switch (path) {
        case runtimeDir:
          return [createDirectory('pkg-a'), createDirectory('pkg-b')];
        case pkgADir:
        case pkgBDir:
          return [];
        default:
          throw new Error(`Unexpected readdir path: ${path}`);
      }
    });

    try {
      const workspaces = await discoverWorkspacesWithScript('lint');

      expect(diffCalled).toBe(true);

      expect(workspaces).toEqual([
        {
          name: 'pkg-b',
          dir: 'platform/runtime/pkg-b',
          testFileCount: 0,
          hasChanges: true,
        },
        {
          name: 'pkg-a',
          dir: 'platform/runtime/pkg-a',
          testFileCount: 0,
          hasChanges: false,
        },
      ]);
    } finally {
      readFileSpy.mockRestore();
      readdirSpy.mockRestore();
      vi.doUnmock('node:child_process');
    }
  });
});
