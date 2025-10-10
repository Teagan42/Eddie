import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PackageLicense {
  name: string;
  version: string;
  license: string;
  path: string;
}

export interface RenderOptions {
  rootDir?: string;
}

export interface CollectOptions {
  rootDir?: string;
}

export interface RunLicenseCheckOptions {
  lockfilePath: string;
  outputPath: string;
  allowedLicenses: Iterable<string>;
  rootDir?: string;
  check?: boolean;
}

const LICENSE_CANDIDATES = [
  'LICENSE',
  'LICENSE.txt',
  'LICENSE.md',
  'LICENCE',
  'LICENCE.txt',
  'LICENCE.md',
  'COPYING',
  'COPYING.txt',
  'UNLICENSE',
];

const NOTICE_CANDIDATES = ['NOTICE', 'NOTICE.txt', 'NOTICE.md'];

function normalizeLicense(license: any): string | undefined {
  if (!license) {
    return undefined;
  }

  if (typeof license === 'string') {
    return license;
  }

  if (Array.isArray(license)) {
    const parts = license
      .map(normalizeLicense)
      .filter((part): part is string => Boolean(part));
    return parts.join(' OR ');
  }

  if (typeof license === 'object') {
    if (typeof license.type === 'string') {
      return license.type;
    }

    if ('license' in license) {
      return normalizeLicense((license as { license: unknown }).license);
    }
  }

  return undefined;
}

function resolveLicenseFromManifest(rootDir: string | undefined, path: string): string | undefined {
  if (!rootDir) {
    return undefined;
  }

  const manifestPath = join(rootDir, path, 'package.json');
  if (!existsSync(manifestPath)) {
    return undefined;
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      license?: unknown;
      licenses?: unknown;
    };

    return (
      normalizeLicense(manifest.license) ??
      normalizeLicense(manifest.licenses)
    );
  } catch (error) {
    return undefined;
  }
}

function deriveNameFromPath(path: string) {
  const segments = path.split('node_modules/').pop();
  if (!segments) {
    return path;
  }

  return segments.replace(/\\/g, '/');
}

export function collectLicenses(lockfilePath: string, options: CollectOptions = {}): PackageLicense[] {
  const { rootDir } = options;
  const raw = readFileSync(lockfilePath, 'utf8');
  const data = JSON.parse(raw) as { packages?: Record<string, any> };
  const packages: PackageLicense[] = [];
  const seen = new Map<string, PackageLicense>();

  for (const [path, info] of Object.entries(data.packages ?? {})) {
    if (!path || path === '' || !info) {
      continue;
    }

    if (!path.startsWith('node_modules')) {
      continue;
    }

    if (info.link) {
      continue;
    }

    const name = typeof info.name === 'string' ? info.name : deriveNameFromPath(path);
    const version = typeof info.version === 'string' ? info.version : '0.0.0';
    let license = normalizeLicense(info.license) ?? normalizeLicense(info.licenses);
    if (!license) {
      license = resolveLicenseFromManifest(rootDir, path);
    }

    license ??= 'UNKNOWN';

    const key = `${name}@${version}`;
    if (seen.has(key)) {
      continue;
    }

    const record: PackageLicense = { name, version, license, path };
    seen.set(key, record);
    packages.push(record);
  }

  return packages.sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name);
    if (nameCompare !== 0) {
      return nameCompare;
    }

    const versionCompare = a.version.localeCompare(b.version);
    if (versionCompare !== 0) {
      return versionCompare;
    }

    return a.path.localeCompare(b.path);
  });
}

function expandLicenseSet(license: string): string[] {
  return license
    .split(/(?:\s+AND\s+|\s+OR\s+|,)/i)
    .map(token => token.replace(/[()]/g, '').trim())
    .filter(Boolean);
}

export function assertLicensesAllowed(packages: PackageLicense[], allowed: Iterable<string>): void {
  const allowedSet = new Set(allowed);
  const disallowed = packages.filter(pkg => {
    const licenses = expandLicenseSet(pkg.license);
    if (licenses.length === 0) {
      return true;
    }

    return licenses.some(part => !allowedSet.has(part));
  });

  if (disallowed.length > 0) {
    const lines = disallowed.map(pkg => `- ${pkg.name}@${pkg.version} (${pkg.license})`);
    throw new Error(`Found disallowed licenses:\n${lines.join('\n')}`);
  }
}

function readFirstExistingFile(baseDir: string, candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const fullPath = join(baseDir, candidate);
    if (existsSync(fullPath)) {
      return readFileSync(fullPath, 'utf8').trim();
    }
  }

  return undefined;
}

export function renderNoticeMarkdown(
  packages: PackageLicense[],
  options: RenderOptions = {},
): string {
  const { rootDir = process.cwd() } = options;
  const lines: string[] = [
    '# Third-Party Notices',
    '',
    'This document lists open-source dependencies bundled with this project alongside their associated licenses.',
    '',
  ];

  for (const pkg of packages) {
    const pkgDir = join(rootDir, pkg.path);
    const licenseText = readFirstExistingFile(pkgDir, LICENSE_CANDIDATES);
    const noticeText = readFirstExistingFile(pkgDir, NOTICE_CANDIDATES);

    lines.push(`## ${pkg.name}@${pkg.version}`);
    lines.push('');
    lines.push(`**License:** ${pkg.license}`);
    lines.push('');

    if (licenseText) {
      lines.push('````text');
      lines.push(licenseText);
      lines.push('````');
      lines.push('');
    }

    if (noticeText) {
      lines.push('````text');
      lines.push(noticeText);
      lines.push('````');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

export function runLicenseCheck(options: RunLicenseCheckOptions): { updated: boolean } {
  const {
    lockfilePath,
    outputPath,
    allowedLicenses,
    rootDir = process.cwd(),
    check = false,
  } = options;

  const packages = collectLicenses(lockfilePath, { rootDir });
  assertLicensesAllowed(packages, allowedLicenses);
  const markdown = renderNoticeMarkdown(packages, { rootDir });

  if (check) {
    if (!existsSync(outputPath)) {
      throw new Error(
        'THIRD_PARTY_NOTICES.md is out of date. Run the license check without --check to regenerate it.',
      );
    }

    const current = readFileSync(outputPath, 'utf8');
    if (current !== markdown) {
      throw new Error(
        'THIRD_PARTY_NOTICES.md is out of date. Run the license check without --check to regenerate it.',
      );
    }

    return { updated: false };
  }

  writeFileSync(outputPath, markdown);
  return { updated: true };
}

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

interface CliOptions {
  args: RunLicenseCheckOptions;
}

function parseArgs(argv: string[]): CliOptions {
  const args: Partial<RunLicenseCheckOptions> = {
    lockfilePath: 'package-lock.json',
    outputPath: 'THIRD_PARTY_NOTICES.md',
    allowedLicenses: DEFAULT_ALLOWED_LICENSES,
    rootDir: process.cwd(),
    check: false,
  };

  const allowed: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    switch (token) {
      case '--lockfile':
        args.lockfilePath = argv[++i];
        break;
      case '--output':
        args.outputPath = argv[++i];
        break;
      case '--root':
        args.rootDir = argv[++i];
        break;
      case '--allow':
        allowed.push(argv[++i]);
        break;
      case '--check':
        args.check = true;
        break;
      default: {
        if (token.startsWith('--lockfile=')) {
          args.lockfilePath = token.split('=')[1];
        } else if (token.startsWith('--output=')) {
          args.outputPath = token.split('=')[1];
        } else if (token.startsWith('--root=')) {
          args.rootDir = token.split('=')[1];
        } else if (token.startsWith('--allow=')) {
          allowed.push(token.split('=')[1]);
        }
        break;
      }
    }
  }

  if (allowed.length > 0) {
    args.allowedLicenses = allowed;
  }

  return { args: args as RunLicenseCheckOptions };
}

function main(argv = process.argv.slice(2)) {
  try {
    const { args } = parseArgs(argv);
    const { updated } = runLicenseCheck(args);
    if (updated) {
      // eslint-disable-next-line no-console
      console.log(`Updated ${args.outputPath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}
