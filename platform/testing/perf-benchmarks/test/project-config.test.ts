import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

const repoRoot = resolve(__dirname, '..', '..', '..', '..');
const packageRoot = resolve(__dirname, '..');
const expectedWorkspaceReferences = [
  '../../runtime/context',
  '../../core/templates',
  '../../integrations/providers',
  '../../../apps/api',
] as const;

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, 'utf-8')) as T;

test('api tsconfig enables project references', async () => {
  const tsconfig = await readJson<Record<string, unknown>>(
    resolve(repoRoot, 'apps', 'api', 'tsconfig.json'),
  );

  const compilerOptions = tsconfig.compilerOptions as Record<string, unknown> | undefined;

  expect(compilerOptions?.composite).toBe(true);
});

test('perf benchmarks depend on shared runtime packages', async () => {
  const packageJson = await readJson<Record<string, unknown>>(
    resolve(packageRoot, 'package.json'),
  );

  const dependencies = packageJson.dependencies as Record<string, string> | undefined;

  expect(dependencies).toMatchObject({
    '@eddie/context': '^0.0.0',
    '@eddie/templates': '^0.0.0',
    '@eddie/providers': '^0.0.0',
    '@eddie/api': '^0.0.0',
  });
});

test('perf benchmark tsconfig references shared packages', async () => {
  const tsconfig = await readJson<Record<string, unknown>>(
    resolve(packageRoot, 'tsconfig.json'),
  );

  const references = (tsconfig.references as Array<{ path: string }> | undefined)?.map(
    (reference) => reference.path,
  );

  expect(references).toEqual(expect.arrayContaining(expectedWorkspaceReferences));
});

test('perf benchmark build config references shared packages', async () => {
  const tsconfig = await readJson<Record<string, unknown>>(
    resolve(packageRoot, 'tsconfig.build.json'),
  );

  const references = (tsconfig.references as Array<{ path: string }> | undefined)?.map(
    (reference) => reference.path,
  );

  expect(references).toEqual(expect.arrayContaining(expectedWorkspaceReferences));
});

test('chat sessions persistence bench uses API package exports', async () => {
  const source = await readFile(
    resolve(packageRoot, 'src', 'chat-sessions-persistence.bench.ts'),
    'utf-8',
  );

  expect(source).toMatch(/from '@eddie\/api(?:['/])/);
  expect(source).not.toContain("../../../apps/api");

  const vitestImport = source.match(/import\s+\{([^}]*)\}\s+from\s+'vitest';/);
  expect(vitestImport?.[1]).toContain('describe');
  expect(vitestImport?.[1]).not.toContain('group');
});
