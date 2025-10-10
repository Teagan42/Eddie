import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

describe('root package scripts', () => {
  it('runs API and web development servers together', () => {
    expect(packageJson.scripts.dev).toBe(
      'concurrently "npm run dev:api --if-present" "npm run web:dev --if-present"',
    );
  });

  it('installs concurrently to manage the dev processes', () => {
    expect(packageJson.devDependencies.concurrently).toBeDefined();
  });
});
