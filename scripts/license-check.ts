import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

const LICENSE_PATTERNS: Array<[RegExp, string]> = [
  [/\bmit license\b/i, 'MIT'],
  [/apache license[^\n]*version\s*2\.0/i, 'Apache-2.0'],
  [/bsd\s*2-clause/i, 'BSD-2-Clause'],
  [/bsd\s*3-clause/i, 'BSD-3-Clause'],
  [/isc license/i, 'ISC'],
  [/mozilla public license[^\n]*version\s*2\.0/i, 'MPL-2.0'],
  [/blue oak model license/i, 'BlueOak-1.0.0'],
  [/business source license/i, 'BUSL-1.1'],
  [/\bthe unlicense\b/i, 'Unlicense'],
  [/creative commons zero/i, 'CC0-1.0'],
  [/creative commons attribution[^\n]*4\.0/i, 'CC-BY-4.0'],
];

function inferLicenseFromText(text: string | undefined): string | undefined {
  if (!text) {
    return undefined;
  }

  for (const [pattern, license] of LICENSE_PATTERNS) {
    if (pattern.test(text)) {
      return license;
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

const registryLicenseCache = new Map<string, string | null>();
const repositoryLicenseCache = new Map<string, string | null>();
const REPOSITORY_LICENSE_BRANCHES = ['main', 'master'] as const;
const LICENSE_CACHE_PATH = join(process.cwd(), '.cache', 'license-check.json');
const LICENSE_CACHE_DIR = dirname(LICENSE_CACHE_PATH);
let licenseCacheLoaded = false;

interface LicenseCacheData {
  registry?: Record<string, string | null>;
  repository?: Record<string, string | null>;
}

function ensureLicenseCacheLoaded() {
  if (licenseCacheLoaded) {
    return;
  }

  licenseCacheLoaded = true;

  if (!existsSync(LICENSE_CACHE_PATH)) {
    return;
  }

  try {
    const raw = readFileSync(LICENSE_CACHE_PATH, 'utf8');
    const data = JSON.parse(raw) as LicenseCacheData;

    for (const [key, value] of Object.entries(data.registry ?? {})) {
      registryLicenseCache.set(key, typeof value === 'string' ? value : null);
    }

    for (const [key, value] of Object.entries(data.repository ?? {})) {
      repositoryLicenseCache.set(key, typeof value === 'string' ? value : null);
    }
  } catch {
    registryLicenseCache.clear();
    repositoryLicenseCache.clear();
  }
}

function persistLicenseCache() {
  const data: LicenseCacheData = {
    registry: Object.fromEntries(registryLicenseCache.entries()),
    repository: Object.fromEntries(repositoryLicenseCache.entries()),
  };

  if (!existsSync(LICENSE_CACHE_DIR)) {
    mkdirSync(LICENSE_CACHE_DIR, { recursive: true });
  }

  writeFileSync(LICENSE_CACHE_PATH, JSON.stringify(data, null, 2));
}

interface RepositoryCoordinates {
  host: string;
  owner: string;
  name: string;
}

function parseRepository(repository: unknown): RepositoryCoordinates | undefined {
  const value =
    typeof repository === 'string'
      ? repository
      : typeof repository === 'object' && repository && 'url' in repository
        ? (repository as { url?: unknown }).url
        : undefined;

  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  let url = value.trim();
  if (url.startsWith('git+')) {
    url = url.slice(4);
  }

  if (url.startsWith('git://')) {
    url = `https://${url.slice(6)}`;
  }

  if (url.endsWith('.git')) {
    url = url.slice(0, -4);
  }

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2) {
      return undefined;
    }

    return {
      host: parsed.hostname,
      owner: segments[0],
      name: segments[1],
    };
  } catch {
    return undefined;
  }
}

async function resolveLicenseFromRepository(repository: unknown): Promise<string | undefined> {
  ensureLicenseCacheLoaded();
  const coordinates = parseRepository(repository);
  if (!coordinates) {
    return undefined;
  }

  const cacheKey = `${coordinates.host}:${coordinates.owner}/${coordinates.name}`;
  if (repositoryLicenseCache.has(cacheKey)) {
    return repositoryLicenseCache.get(cacheKey) ?? undefined;
  }

  if (coordinates.host === 'github.com') {
    const base = `https://raw.githubusercontent.com/${coordinates.owner}/${coordinates.name}`;

    for (const branch of REPOSITORY_LICENSE_BRANCHES) {
      for (const candidate of LICENSE_CANDIDATES) {
        const url = `${base}/${branch}/${candidate}`;
        try {
          const response = await fetch(url);
          if (!response.ok) {
            continue;
          }

          const text = (await response.text()).trim();
          const inferred = inferLicenseFromText(text);
          if (inferred) {
            repositoryLicenseCache.set(cacheKey, inferred);
            persistLicenseCache();
            return inferred;
          }
        } catch {
          // ignore network errors and try next candidate
        }
      }
    }
  }

  repositoryLicenseCache.set(cacheKey, null);
  persistLicenseCache();
  return undefined;
}

function encodePackageName(name: string): string {
  return encodeURIComponent(name).replace(/^%40/, '@');
}

async function resolveLicenseFromRegistry(
  name: string,
  version: string,
): Promise<string | undefined> {
  ensureLicenseCacheLoaded();
  const cacheKey = `${name}@${version}`;
  if (registryLicenseCache.has(cacheKey)) {
    return registryLicenseCache.get(cacheKey) ?? undefined;
  }

  const encodedName = encodePackageName(name);
  const url = `https://registry.npmjs.org/${encodedName}/${version}`;

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.npm.install-v1+json, application/json',
      },
    });

    if (!response.ok) {
      registryLicenseCache.set(cacheKey, null);
      return undefined;
    }

    const manifest = (await response.json()) as {
      license?: unknown;
      licenses?: unknown;
      repository?: unknown;
    };

    let license =
      normalizeLicense(manifest.license) ?? normalizeLicense(manifest.licenses);

    if (!license) {
      license = await resolveLicenseFromRepository(manifest.repository);
    }

    registryLicenseCache.set(cacheKey, license ?? null);
    persistLicenseCache();
    return license ?? undefined;
  } catch {
    registryLicenseCache.set(cacheKey, null);
    persistLicenseCache();
    return undefined;
  }
}

export async function collectLicenses(
  lockfilePath: string,
  options: CollectOptions = {},
): Promise<PackageLicense[]> {
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
    const packageRoot = rootDir ? join(rootDir, path) : undefined;
    let license = normalizeLicense(info.license) ?? normalizeLicense(info.licenses);
    if (!license) {
      license = resolveLicenseFromManifest(rootDir, path);
    }

    if (!license && packageRoot) {
      const fallbackText = readFirstExistingFile(packageRoot, LICENSE_CANDIDATES);
      const inferred = inferLicenseFromText(fallbackText);
      if (inferred) {
        license = inferred;
      }
    }

    if (!license) {
      license = await resolveLicenseFromRegistry(name, version);
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

type LicenseExpression =
  | { type: 'license'; value: string }
  | { type: 'and' | 'or'; left: LicenseExpression; right: LicenseExpression };

type LicenseToken = '(' | ')' | 'AND' | 'OR' | string;

function tokenizeLicenseExpression(input: string): LicenseToken[] {
  const tokens: LicenseToken[] = [];
  const pattern = /\s*(\(|\)|AND|OR|,|[^()\s]+)\s*/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input))) {
    const raw = match[1];
    if (!raw) {
      continue;
    }

    if (raw === '(' || raw === ')') {
      tokens.push(raw);
      continue;
    }

    const upper = raw.toUpperCase();
    if (upper === 'AND' || upper === 'OR') {
      tokens.push(upper);
      continue;
    }

    if (raw === ',') {
      tokens.push('OR');
      continue;
    }

    tokens.push(raw);
  }

  return tokens;
}

function parseLicenseExpression(input: string): LicenseExpression | undefined {
  const tokens = tokenizeLicenseExpression(input);
  let index = 0;

  function peek(): LicenseToken | undefined {
    return tokens[index];
  }

  function consume(): LicenseToken | undefined {
    return tokens[index++];
  }

  function parsePrimary(): LicenseExpression | undefined {
    const token = consume();
    if (!token) {
      return undefined;
    }

    if (token === '(') {
      const expression = parseOr();
      if (peek() === ')') {
        consume();
      }
      return expression;
    }

    if (token === ')' || token === 'AND' || token === 'OR') {
      return undefined;
    }

    return { type: 'license', value: token };
  }

  function parseAnd(): LicenseExpression | undefined {
    let left = parsePrimary();
    while (left && peek() === 'AND') {
      consume();
      const right = parsePrimary();
      if (!right) {
        return undefined;
      }
      left = { type: 'and', left, right };
    }
    return left;
  }

  function parseOr(): LicenseExpression | undefined {
    let left = parseAnd();
    while (left && peek() === 'OR') {
      consume();
      const right = parseAnd();
      if (!right) {
        return undefined;
      }
      left = { type: 'or', left, right };
    }
    return left;
  }

  return parseOr();
}

function isLicenseExpressionAllowed(
  expression: LicenseExpression | undefined,
  allowedSet: Set<string>,
): boolean {
  if (!expression) {
    return false;
  }

  if (expression.type === 'license') {
    return allowedSet.has(expression.value);
  }

  if (expression.type === 'and') {
    return (
      isLicenseExpressionAllowed(expression.left, allowedSet) &&
      isLicenseExpressionAllowed(expression.right, allowedSet)
    );
  }

  return (
    isLicenseExpressionAllowed(expression.left, allowedSet) ||
    isLicenseExpressionAllowed(expression.right, allowedSet)
  );
}

export function assertLicensesAllowed(packages: PackageLicense[], allowed: Iterable<string>): void {
  const allowedSet = new Set(allowed);
  const disallowed = packages.filter(pkg => {
    const expression = parseLicenseExpression(pkg.license);
    return !isLicenseExpressionAllowed(expression, allowedSet);
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

export async function runLicenseCheck(
  options: RunLicenseCheckOptions,
): Promise<{ updated: boolean }> {
  const {
    lockfilePath,
    outputPath,
    allowedLicenses,
    rootDir = process.cwd(),
    check = false,
  } = options;

  const packages = await collectLicenses(lockfilePath, { rootDir });
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

async function main(argv = process.argv.slice(2)) {
  try {
    const { args } = parseArgs(argv);
    const { updated } = await runLicenseCheck(args);
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
  void main();
}
