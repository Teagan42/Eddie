import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type StubbedModules = Record<string, unknown>;

const defaultStubs: StubbedModules = {
  '@eslint/js': { configs: { recommended: { rules: {} } } },
  '@typescript-eslint/eslint-plugin': { configs: { recommended: { rules: {} } } },
  '@typescript-eslint/parser': {},
  globals: { node: {}, browser: {} },
  'eslint-plugin-react': { configs: { recommended: { rules: {} } } },
  'eslint-plugin-react-hooks': { configs: { recommended: { rules: {} } } },
  'eslint-plugin-jsx-a11y': { configs: { recommended: { rules: {} } } },
};

const moduleCache = new Map<string, unknown>();

function loadCommonJsModule(specifier: string | URL, overrides: StubbedModules = {}) {
  const moduleUrl = specifier instanceof URL ? specifier : new URL(specifier, import.meta.url);
  const configPath = fileURLToPath(moduleUrl);
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    const cached = moduleCache.get(configPath);
    if (cached !== undefined) {
      return cached;
    }
  }
  const source = readFileSync(configPath, 'utf8');
  const module = { exports: undefined } as { exports: any };
  const stubs = { ...defaultStubs, ...overrides };
  const fakeRequire = (id: string) => {
    if (id in stubs) {
      return stubs[id as keyof typeof stubs];
    }
    if (id.startsWith('.') || id.startsWith('/')) {
      return loadCommonJsModule(new URL(id, moduleUrl), overrides);
    }
    throw new Error(`Unexpected module request: ${id}`);
  };
  const fn = new Function('require', 'module', 'exports', source) as (
    require: (id: string) => unknown,
    module: { exports: unknown },
    exports: unknown,
  ) => void;
  fn(fakeRequire, module, module.exports);
  const result = module.exports;
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    moduleCache.set(configPath, result);
  }
  return result;
}

function loadEslintConfig() {
  return loadCommonJsModule('../eslint.config.cjs');
}

function loadLegacyRootConfig() {
  return loadCommonJsModule('../.eslintrc.cjs');
}

function loadWebConfig() {
  return loadCommonJsModule('../apps/web/eslint.config.cjs');
}

describe('eslint config', () => {
  const config = loadEslintConfig();

  it('ignores generated api client sources', () => {
    const ignoreEntry = config.find((entry: { ignores?: string[] }) => Array.isArray(entry.ignores));
    expect(ignoreEntry?.ignores).toContain('platform/integrations/api-client/src/generated/**');
  });

  it('enforces two-space indentation in TypeScript sources', () => {
    const tsEntry = config.find((entry: { files?: string[] }) =>
      entry.files?.some((pattern) => ['**/*.ts', '**/*.{ts,tsx}'].includes(pattern)),
    );
    expect(tsEntry?.rules?.indent?.[0]).toBe('error');
    expect(tsEntry?.rules?.indent?.[1]).toBe(2);
  });
});

describe('legacy root eslint config', () => {
  const config = loadLegacyRootConfig();

  it('enforces two-space indentation globally', () => {
    expect(config.rules?.indent?.[0]).toBe('error');
    expect(config.rules?.indent?.[1]).toBe(2);
  });
});

describe('web eslint config', () => {
  const config = loadWebConfig();

  it('enforces two-space indentation in React TypeScript sources', () => {
    const tsxEntry = config.find((entry: { files?: string[] }) => entry.files?.includes('**/*.{ts,tsx}'));
    expect(tsxEntry?.rules?.indent?.[0]).toBe('error');
    expect(tsxEntry?.rules?.indent?.[1]).toBe(2);
  });
});
