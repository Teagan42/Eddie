import { describe, expect, it } from 'vitest';
import { readJson } from './helpers/fs';

type PackageJson = {
  name: string;
  scripts?: Record<string, string>;
};

describe('@eddie/ui package metadata', () => {
  const packageJson = readJson<PackageJson>('platform/ui/package.json');

  it('is published under the shared @eddie scope', () => {
    expect(packageJson.name).toBe('@eddie/ui');
  });

  it('exposes workspace build, lint, and test scripts', () => {
    expect(packageJson.scripts?.build).toBe('npm run build:cjs && npm run build:esm && npm run build:types');
    expect(packageJson.scripts?.lint).toBe('eslint "src/**/*.ts"');
    expect(packageJson.scripts?.test).toBe('vitest run');
  });
});
