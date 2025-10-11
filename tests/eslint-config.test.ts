import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function loadEslintConfig() {
  const configPath = fileURLToPath(new URL('../eslint.config.cjs', import.meta.url));
  const source = readFileSync(configPath, 'utf8');
  const module = { exports: undefined } as { exports: any };
  const fakeRequire = (id: string) => {
    switch (id) {
      case '@eslint/js':
      case '@typescript-eslint/eslint-plugin':
        return { configs: { recommended: { rules: {} } } };
      case '@typescript-eslint/parser':
        return {};
      case 'globals':
        return { node: {} };
      default:
        throw new Error(`Unexpected module request: ${id}`);
    }
  };
  const fn = new Function('require', 'module', 'exports', source) as (
    require: (id: string) => unknown,
    module: { exports: unknown },
    exports: unknown,
  ) => void;
  fn(fakeRequire, module, module.exports);
  return module.exports;
}

describe('eslint config', () => {
  const config = loadEslintConfig();

  it('ignores generated api client sources', () => {
    const ignoreEntry = config.find((entry: { ignores?: string[] }) => Array.isArray(entry.ignores));
    expect(ignoreEntry?.ignores).toContain('packages/api-client/src/generated/**');
  });

  it('enforces two-space indentation in TypeScript sources', () => {
    const tsEntry = config.find((entry: { files?: string[] }) => entry.files?.includes('**/*.ts'));
    expect(tsEntry?.rules?.indent?.[0]).toBe('error');
    expect(tsEntry?.rules?.indent?.[1]).toBe(2);
  });
});
