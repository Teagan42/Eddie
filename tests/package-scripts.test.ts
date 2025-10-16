import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const convenienceScripts = {
  clean: 'npm run clean --workspaces --if-present && git clean -fdX',
  reset: 'npm run clean && npm install',
  typecheck: 'npm run typecheck --workspaces --if-present',
  'test:coverage': 'npm run test -- --coverage',
  'test:integration': 'npm run test:integration --workspaces --if-present',
  'test:unit': 'npm run test:unit --workspaces --if-present',
  preTest: 'npm run build',
  'agent:check': 'WORKSPACE_TEST_CONCURRENCY=2 npm run lint && npm run test',
  'docs:serve': 'npx serve docs',
  'db:migrate': 'npm run db:migrate --workspace @eddie/api --if-present',
  'db:seed': 'npm run db:seed --workspace @eddie/api --if-present',
} as const;

describe('root package scripts', () => {
  it('runs API and web development servers together', () => {
    expect(packageJson.scripts.dev).toBe(
      'concurrently "npm run dev:api --if-present" "npm run web:dev --if-present"',
    );
  });

  it('installs concurrently to manage the dev processes', () => {
    expect(packageJson.devDependencies.concurrently).toBeDefined();
  });

  it('runs workspace tests in parallel with readable prefixes', () => {
    expect(packageJson.scripts.test).toBe('tsx scripts/workspace-tests.ts');
  });

  it.each(Object.entries(convenienceScripts))('exposes a "%s" convenience script', (script, command) => {
    expect(packageJson.scripts[script]).toBe(command);
  });
});
