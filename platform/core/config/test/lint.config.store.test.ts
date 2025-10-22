import { beforeAll, describe, expect, it } from 'vitest';

import { lintFile } from './support/eslint';

describe('config store linting', () => {
  let lintResult: Awaited<ReturnType<typeof lintFile>>;

  beforeAll(async () => {
    lintResult = await lintFile('src/config.store.ts');
  });

  it('enforces eslint rules on config.store.ts', () => {
    expect(lintResult.errorCount, JSON.stringify(lintResult.messages, null, 2)).toBe(0);
  });

  it('treats warnings as failures for config.store.ts', () => {
    expect(lintResult.warningCount, JSON.stringify(lintResult.messages, null, 2)).toBe(0);
  });
});
