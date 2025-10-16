import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const packageRoot = join(__dirname, '..');
const repoRoot = join(packageRoot, '..', '..', '..');

const readJson = <T = unknown>(relativePath: string): T => {
  const content = readFileSync(relativePath, 'utf8');
  return JSON.parse(content) as T;
};

const expectedReferences = [
  { path: '../../runtime/context' },
  { path: '../../core/templates' },
  { path: '../../integrations/providers' },
  { path: '../../../apps/api' },
] as const;

const expectReferences = (config: Record<string, unknown>) => {
  expect(config.references).toEqual(expectedReferences);
};

describe('perf benchmark workspace alignment', () => {
  it('depends on API runtime packages for shared types', () => {
    const packageJson = readJson<Record<string, any>>(join(packageRoot, 'package.json'));
    expect(packageJson.dependencies).toMatchObject({
      '@eddie/context': '^0.0.0',
      '@eddie/templates': '^0.0.0',
      '@eddie/providers': '^0.0.0',
      '@eddie/api': '^0.0.0',
    });
  });

  it('references upstream workspaces to compile benchmarks', () => {
    const tsconfig = readJson<Record<string, any>>(join(packageRoot, 'tsconfig.json'));
    expectReferences(tsconfig);
  });

  it('aligns build config references with source config', () => {
    const tsconfig = readJson<Record<string, any>>(join(packageRoot, 'tsconfig.build.json'));
    expectReferences(tsconfig);
  });

  it('uses the API workspace import aliases', () => {
    const benchSource = readFileSync(
      join(packageRoot, 'src/chat-sessions-persistence.bench.ts'),
      'utf8',
    );
    expect(benchSource).toContain("from '@eddie/api/src/chat-sessions/chat-sessions.repository'");
    expect(benchSource).toContain("from '@eddie/api/src/chat-sessions/dto/create-chat-message.dto'");
    expect(benchSource).not.toContain('../../../apps/api');

    const vitestImport = benchSource
      .split('\n')
      .find((line) => line.includes("from 'vitest'"));
    expect(vitestImport).toBeDefined();
    expect(vitestImport).toContain('describe');
    expect(vitestImport).not.toContain('group');
  });

  it('enables project references for the API app', () => {
    const apiTsconfig = readJson<Record<string, any>>(join(repoRoot, 'apps/api/tsconfig.json'));
    expect(apiTsconfig.compilerOptions?.composite).toBe(true);
  });
});
