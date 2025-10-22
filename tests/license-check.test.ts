import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertLicensesAllowed,
  collectLicenses,
  renderNoticeMarkdown,
  runLicenseCheck,
} from '../scripts/license-check';

const LICENSE_CACHE_PATH = join(process.cwd(), '.cache', 'license-check.json');
const CI_WORKFLOW_PATH = join(process.cwd(), '.github/workflows/ci.yml');
rmSync(LICENSE_CACHE_PATH, { force: true });

const DEFAULT_ALLOWED_LICENSES = [
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BUSL-1.1',
  'CC0-1.0',
  'CC-BY-4.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
];

const THIRD_PARTY_NOTICE_HEADER = [
  '# Third-Party Notices',
  '',
  'This document lists open-source dependencies bundled with this project alongside their associated licenses.',
  '',
].join('\n');

const THIRD_PARTY_NOTICE_PATH = join(process.cwd(), 'THIRD_PARTY_NOTICES.md');

function createTempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_TOKEN;
});

describe('collectLicenses', () => {
  it('extracts third-party dependencies from an npm lockfile', async () => {
    const dir = createTempDir('license-lock-');
    const lockfilePath = join(dir, 'package-lock.json');

    const lockfile = {
      name: 'fixture',
      version: '0.0.0-test',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'fixture',
          version: '0.0.0-test',
          license: 'BUSL-1.1',
        },
        'apps/api': {
          name: '@eddie/api',
          version: '1.0.0',
          license: 'BUSL-1.1',
        },
        'node_modules/alpha': {
          name: 'alpha',
          version: '1.2.3',
          license: 'MIT',
        },
        'node_modules/beta': {
          name: 'beta',
          version: '4.5.6',
          license: 'ISC',
        },
        'node_modules/beta/node_modules/gamma': {
          name: 'gamma',
          version: '7.8.9',
          license: 'Apache-2.0',
        },
        'node_modules/link': {
          name: 'link',
          version: '0.0.1',
          license: 'MIT',
          resolved: '../..',
          link: true,
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));

    await expect(collectLicenses(lockfilePath)).resolves.toEqual([
      {
        name: 'alpha',
        version: '1.2.3',
        license: 'MIT',
        path: 'node_modules/alpha',
      },
      {
        name: 'beta',
        version: '4.5.6',
        license: 'ISC',
        path: 'node_modules/beta',
      },
      {
        name: 'gamma',
        version: '7.8.9',
        license: 'Apache-2.0',
        path: 'node_modules/beta/node_modules/gamma',
      },
    ]);
  });

  it('reads package manifests to recover missing license metadata', async () => {
    const dir = createTempDir('license-lock-fallback-');
    const lockfilePath = join(dir, 'package-lock.json');
    const nodeModules = join(dir, 'node_modules');
    mkdirSync(nodeModules);

    const omegaDir = join(nodeModules, 'omega');
    mkdirSync(omegaDir, { recursive: true });
    writeFileSync(
      join(omegaDir, 'package.json'),
      JSON.stringify({ name: 'omega', version: '9.9.9', license: 'BSD-3-Clause' }, null, 2),
    );

    const lockfile = {
      name: 'fixture',
      version: '0.0.0-test',
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture', version: '0.0.0-test', license: 'BUSL-1.1' },
        'node_modules/omega': {
          name: 'omega',
          version: '9.9.9',
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));

    await expect(collectLicenses(lockfilePath, { rootDir: dir })).resolves.toEqual([
      { name: 'omega', version: '9.9.9', license: 'BSD-3-Clause', path: 'node_modules/omega' },
    ]);
  });

  it('reads license files when package metadata omits the license field', async () => {
    const dir = createTempDir('license-lock-license-fallback-');
    const lockfilePath = join(dir, 'package-lock.json');
    const nodeModules = join(dir, 'node_modules');
    mkdirSync(nodeModules);

    const thetaDir = join(nodeModules, 'theta');
    mkdirSync(thetaDir, { recursive: true });
    writeFileSync(join(thetaDir, 'LICENSE'), 'MIT License');

    const lockfile = {
      name: 'fixture',
      version: '0.0.0-test',
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture', version: '0.0.0-test', license: 'BUSL-1.1' },
        'node_modules/theta': {
          name: 'theta',
          version: '1.0.0',
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));

    await expect(collectLicenses(lockfilePath, { rootDir: dir })).resolves.toEqual([
      { name: 'theta', version: '1.0.0', license: 'MIT', path: 'node_modules/theta' },
    ]);
  });

  it('fetches license metadata from the npm registry when metadata is missing locally', async () => {
    const dir = createTempDir('license-lock-registry-');
    const lockfilePath = join(dir, 'package-lock.json');

    const lockfile = {
      name: 'fixture',
      version: '0.0.0-test',
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture', version: '0.0.0-test', license: 'BUSL-1.1' },
        'node_modules/map-stream': {
          name: 'map-stream',
          version: '0.1.0',
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ license: 'MIT' }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const result = await collectLicenses(lockfilePath, { rootDir: dir });

    expect(result).toContainEqual({
      name: 'map-stream',
      version: '0.1.0',
      license: 'MIT',
      path: 'node_modules/map-stream',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to repository license metadata when the registry omits the license field', async () => {
    const dir = createTempDir('license-lock-repo-');
    const lockfilePath = join(dir, 'package-lock.json');

    const lockfile = {
      name: 'fixture',
      version: '0.0.0-test',
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture', version: '0.0.0-test', license: 'BUSL-1.1' },
        'node_modules/union': {
          name: 'union',
          version: '0.5.0',
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));

    process.env.GITHUB_TOKEN = 'test-token';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          repository: { type: 'git', url: 'git+https://github.com/substack/node-union.git' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          license: { spdx_id: 'MIT' },
        }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const result = await collectLicenses(lockfilePath, { rootDir: dir });

    expect(result).toContainEqual({
      name: 'union',
      version: '0.5.0',
      license: 'MIT',
      path: 'node_modules/union',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondCall] = fetchMock.mock.calls;
    expect(secondCall[0]).toBe('https://api.github.com/repos/substack/node-union/license');
    expect(secondCall[1]).toMatchObject({
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer test-token',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  });

  it('decodes GitHub license content when metadata is ambiguous', async () => {
    const dir = createTempDir('license-lock-repo-content-');
    const lockfilePath = join(dir, 'package-lock.json');

    const lockfile = {
      name: 'fixture',
      version: '0.0.0-test',
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture', version: '0.0.0-test', license: 'BUSL-1.1' },
        'node_modules/github-ambiguous': {
          name: 'github-ambiguous',
          version: '1.0.0',
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          repository: {
            type: 'git',
            url: 'git+https://github.com/example/github-ambiguous.git',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          license: { spdx_id: 'NOASSERTION', key: 'other' },
          content: Buffer.from('MIT License').toString('base64'),
          encoding: 'base64',
        }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const result = await collectLicenses(lockfilePath, { rootDir: dir });

    expect(result).toContainEqual({
      name: 'github-ambiguous',
      version: '1.0.0',
      license: 'MIT',
      path: 'node_modules/github-ambiguous',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses cached registry metadata to avoid repeat fetches', async () => {
    rmSync(LICENSE_CACHE_PATH, { force: true });

    const dir = createTempDir('license-lock-cache-');
    const lockfilePath = join(dir, 'package-lock.json');
    const packageName = `cache-target-${Math.random().toString(36).slice(2, 8)}`;
    const packagePath = `node_modules/${packageName}`;

    const lockfile = {
      name: 'fixture',
      version: '0.0.0-test',
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture', version: '0.0.0-test', license: 'BUSL-1.1' },
        [packagePath]: {
          name: packageName,
          version: '1.0.0',
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ license: 'MIT' }),
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const first = await collectLicenses(lockfilePath, { rootDir: dir });
    expect(first).toContainEqual({
      name: packageName,
      version: '1.0.0',
      license: 'MIT',
      path: packagePath,
    });

    fetchMock.mockClear();

    const second = await collectLicenses(lockfilePath, { rootDir: dir });
    expect(second).toEqual(first);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(LICENSE_CACHE_PATH)).toBe(true);
  });

  it('retries registry lookups after a transient failure', async () => {
    rmSync(LICENSE_CACHE_PATH, { force: true });

    const dir = createTempDir('license-lock-registry-retry-');
    const lockfilePath = join(dir, 'package-lock.json');
    const packageName = `retry-target-${Math.random().toString(36).slice(2, 8)}`;
    const packagePath = `node_modules/${packageName}`;

    const lockfile = {
      name: 'fixture',
      version: '0.0.0-test',
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture', version: '0.0.0-test', license: 'BUSL-1.1' },
        [packagePath]: {
          name: packageName,
          version: '1.0.0',
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ license: 'MIT' }),
      });

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const first = await collectLicenses(lockfilePath, { rootDir: dir });
    expect(first).toContainEqual({
      name: packageName,
      version: '1.0.0',
      license: 'UNKNOWN',
      path: packagePath,
    });

    const second = await collectLicenses(lockfilePath, { rootDir: dir });
    expect(second).toContainEqual({
      name: packageName,
      version: '1.0.0',
      license: 'MIT',
      path: packagePath,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('assertLicensesAllowed', () => {
  it('throws when encountering a disallowed license', () => {
    const packages = [
      { name: 'alpha', version: '1.0.0', license: 'MIT', path: 'node_modules/alpha' },
      { name: 'restricted', version: '2.0.0', license: 'GPL-3.0', path: 'node_modules/restricted' },
    ];

    expect(() =>
      assertLicensesAllowed(packages, new Set(['MIT', 'ISC', 'Apache-2.0'])),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Found disallowed licenses:\n- restricted@2.0.0 (GPL-3.0)]`,
    );
  });

  it('accepts SPDX expressions when all components are permitted', () => {
    expect(() =>
      assertLicensesAllowed(
        [
          {
            name: 'composite',
            version: '1.0.0',
            license: 'Apache-2.0 AND MIT',
            path: 'node_modules/composite',
          },
        ],
        new Set(['MIT', 'ISC', 'Apache-2.0']),
      ),
    ).not.toThrow();
  });

  it('accepts SPDX expressions with OR when at least one option is permitted', () => {
    expect(() =>
      assertLicensesAllowed(
        [
          {
            name: 'dual-licensed',
            version: '3.0.0',
            license: 'MIT OR GPL-3.0',
            path: 'node_modules/dual-licensed',
          },
        ],
        new Set(['MIT', 'ISC']),
      ),
    ).not.toThrow();
  });

  it('rejects SPDX expressions with OR when none of the options are permitted', () => {
    expect(() =>
      assertLicensesAllowed(
        [
          {
            name: 'dual-licensed',
            version: '3.0.0',
            license: 'MIT OR GPL-3.0',
            path: 'node_modules/dual-licensed',
          },
        ],
        new Set(['Apache-2.0']),
      ),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Found disallowed licenses:\n- dual-licensed@3.0.0 (MIT OR GPL-3.0)]`,
    );
  });
});

describe('renderNoticeMarkdown', () => {
  it('includes license and notice contents for each dependency', () => {
    const dir = createTempDir('license-notices-');
    const nodeModules = join(dir, 'node_modules');
    mkdirSync(nodeModules);

    const alphaDir = join(nodeModules, 'alpha');
    mkdirSync(alphaDir, { recursive: true });
    writeFileSync(join(alphaDir, 'LICENSE'), 'Alpha License');

    const betaDir = join(nodeModules, '@scope', 'beta');
    mkdirSync(betaDir, { recursive: true });
    writeFileSync(join(betaDir, 'LICENSE.txt'), 'Beta License Text');
    writeFileSync(join(betaDir, 'NOTICE'), 'Beta Notice Text');

    const markdown = renderNoticeMarkdown(
      [
        { name: 'alpha', version: '1.0.0', license: 'MIT', path: 'node_modules/alpha' },
        { name: '@scope/beta', version: '2.0.0', license: 'Apache-2.0', path: 'node_modules/@scope/beta' },
      ],
      { rootDir: dir },
    );

    expect(markdown).toEqual(
      [
        '# Third-Party Notices',
        '',
        'This document lists open-source dependencies bundled with this project alongside their associated licenses.',
        '',
        '## alpha@1.0.0',
        '',
        '**License:** MIT',
        '',
        '````text',
        'Alpha License',
        '````',
        '',
        '---',
        '',
        '## @scope/beta@2.0.0',
        '',
        '**License:** Apache-2.0',
        '',
        '````text',
        'Beta License Text',
        '````',
        '',
        '````text',
        'Beta Notice Text',
        '````',
        '',
        '---',
        '',
      ].join('\n'),
    );
  });
});

describe('runLicenseCheck', () => {
  it('writes the notice file when not in check mode', async () => {
    const dir = createTempDir('license-run-');
    const lockfilePath = join(dir, 'package-lock.json');
    const outputPath = join(dir, 'THIRD_PARTY_NOTICES.md');
    const nodeModules = join(dir, 'node_modules');

    mkdirSync(nodeModules);
    const alphaDir = join(nodeModules, 'alpha');
    mkdirSync(alphaDir, { recursive: true });
    writeFileSync(join(alphaDir, 'LICENSE'), 'Alpha License');

    const lockfile = {
      name: 'fixture',
      version: '0.0.0',
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture', version: '0.0.0', license: 'BUSL-1.1' },
        'node_modules/alpha': {
          name: 'alpha',
          version: '1.0.0',
          license: 'MIT',
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));

    await runLicenseCheck({
      lockfilePath,
      outputPath,
      allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BUSL-1.1'],
      rootDir: dir,
    });

    const content = readFileSync(outputPath, 'utf8');
    expect(content).toContain('## alpha@1.0.0');
  });

  it('throws when check mode detects a stale notice file', async () => {
    const dir = createTempDir('license-run-check-');
    const lockfilePath = join(dir, 'package-lock.json');
    const outputPath = join(dir, 'THIRD_PARTY_NOTICES.md');
    const nodeModules = join(dir, 'node_modules');

    mkdirSync(nodeModules);
    const alphaDir = join(nodeModules, 'alpha');
    mkdirSync(alphaDir, { recursive: true });
    writeFileSync(join(alphaDir, 'LICENSE'), 'Alpha License');

    const lockfile = {
      name: 'fixture',
      version: '0.0.0',
      lockfileVersion: 3,
      packages: {
        '': { name: 'fixture', version: '0.0.0', license: 'BUSL-1.1' },
        'node_modules/alpha': {
          name: 'alpha',
          version: '1.0.0',
          license: 'MIT',
        },
      },
    };

    writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2));
    writeFileSync(outputPath, 'outdated');

    await expect(
      runLicenseCheck({
        lockfilePath,
        outputPath,
        allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BUSL-1.1'],
        rootDir: dir,
        check: true,
      }),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: THIRD_PARTY_NOTICES.md is out of date. Run the license check without --check to regenerate it.]`,
    );
  });
});

describe('repository automation', () => {
  it('does not wire the license check into the lint pipeline', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    const lintScript = packageJson.scripts?.lint ?? '';

    expect(packageJson.scripts?.['lint:licenses']).toBeDefined();
    expect(lintScript).not.toContain('lint:licenses');
  });

  it('keeps third-party notices synchronized with the lockfile', async () => {
    await expect(
      runLicenseCheck({
        lockfilePath: join(process.cwd(), 'package-lock.json'),
        outputPath: join(process.cwd(), 'THIRD_PARTY_NOTICES.md'),
        allowedLicenses: DEFAULT_ALLOWED_LICENSES,
        rootDir: process.cwd(),
        check: true,
      }),
    ).resolves.toEqual({ updated: false });
  });

  it('caches remote license metadata in the CI workflow', () => {
    const workflow = readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const syncJob = workflow.split('sync-third-party-licenses:')[1] ?? '';

    expect(syncJob).toContain('uses: actions/cache@v4');
    expect(syncJob).toContain('Cache license metadata');
    expect(syncJob).toContain('Prepare license metadata cache');
    expect(syncJob).toContain('mkdir -p .cache');
    expect(syncJob).toContain('path: .cache/license-check.json');
  });
});

describe('THIRD_PARTY_NOTICES document', () => {
  it('documents chownr dependency from the lockfile', () => {
    const contents = readFileSync(THIRD_PARTY_NOTICE_PATH, 'utf8');

    expect(contents).toContain('## chownr@3.0.0');
  });

  it('begins with the standard header and description', () => {
    const contents = readFileSync(THIRD_PARTY_NOTICE_PATH, 'utf8');
    expect(contents.startsWith(THIRD_PARTY_NOTICE_HEADER)).toBe(true);
  });
});
