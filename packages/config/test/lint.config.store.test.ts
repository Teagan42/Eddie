import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';

const packageRoot = path.resolve(__dirname, '..');
const eslint = new ESLint({ cwd: packageRoot });

describe('config store linting', () => {
  it('enforces eslint rules on config.store.ts', async () => {
    const [result] = await eslint.lintFiles(['src/config.store.ts']);

    expect(result.errorCount, JSON.stringify(result.messages, null, 2)).toBe(0);
  });
});
