import { describe, expect, it } from 'vitest';
import { readJson } from './helpers/fs';

type Tsconfig = {
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
};

describe('tsconfig path aliases', () => {
  const rootTsconfig = readJson<Tsconfig>('tsconfig.base.json');

  it('maps the @eddie/ui entry point to the UI source directory', () => {
    expect(rootTsconfig.compilerOptions?.paths?.['@eddie/ui']).toEqual(['platform/ui/src']);
    expect(rootTsconfig.compilerOptions?.paths?.['@eddie/ui/*']).toEqual(['platform/ui/src/*']);
  });
});
