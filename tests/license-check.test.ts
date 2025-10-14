import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertLicensesAllowed,
  collectLicenses,
  renderNoticeMarkdown,
  runLicenseCheck,
} from '../scripts/license-check';

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

function createTempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('collectLicenses', () => {
  it('extracts third-party dependencies from an npm lockfile', () => {
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

    expect(collectLicenses(lockfilePath)).toEqual([
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

  it('reads package manifests to recover missing license metadata', () => {
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

    expect(collectLicenses(lockfilePath, { rootDir: dir })).toEqual([
      { name: 'omega', version: '9.9.9', license: 'BSD-3-Clause', path: 'node_modules/omega' },
    ]);
  });

  it('reads license files when package metadata omits the license field', () => {
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

    expect(collectLicenses(lockfilePath, { rootDir: dir })).toEqual([
      { name: 'theta', version: '1.0.0', license: 'MIT', path: 'node_modules/theta' },
    ]);
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
  it('writes the notice file when not in check mode', () => {
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

    runLicenseCheck({
      lockfilePath,
      outputPath,
      allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BUSL-1.1'],
      rootDir: dir,
    });

    const content = readFileSync(outputPath, 'utf8');
    expect(content).toContain('## alpha@1.0.0');
  });

  it('throws when check mode detects a stale notice file', () => {
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

    expect(() =>
      runLicenseCheck({
        lockfilePath,
        outputPath,
        allowedLicenses: ['MIT', 'ISC', 'Apache-2.0', 'BUSL-1.1'],
        rootDir: dir,
        check: true,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: THIRD_PARTY_NOTICES.md is out of date. Run the license check without --check to regenerate it.]`,
    );
  });
});

describe('repository automation', () => {
  it('wires the license check into the lint pipeline', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['lint:licenses']).toBeDefined();
    expect(packageJson.scripts?.lint).toContain('lint:licenses');
  });

  it('keeps third-party notices synchronized with the lockfile', () => {
    expect(() =>
      runLicenseCheck({
        lockfilePath: join(process.cwd(), 'package-lock.json'),
        outputPath: join(process.cwd(), 'THIRD_PARTY_NOTICES.md'),
        allowedLicenses: DEFAULT_ALLOWED_LICENSES,
        rootDir: process.cwd(),
        check: true,
      }),
    ).not.toThrow();
  });
});

describe('THIRD_PARTY_NOTICES document', () => {
  it('begins with the standard header and description', () => {
    const noticePath = join(process.cwd(), 'THIRD_PARTY_NOTICES.md');
    const contents = readFileSync(noticePath, 'utf8');
    expect(contents.startsWith(THIRD_PARTY_NOTICE_HEADER)).toBe(true);
  });
});
