import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);

function readRootFile(path: string) {
  return readFileSync(new URL(path, ROOT), 'utf8');
}

describe('project licensing', () => {
  it('declares a monetization-friendly license in package.json', () => {
    const packageJson = JSON.parse(readRootFile('./package.json'));
    expect(packageJson.license).toBe('BUSL-1.1');
  });

  it('provides the Business Source License text for monetization terms', () => {
    const licenseText = readRootFile('./LICENSE');
    expect(licenseText).toContain('Business Source License 1.1');
    expect(licenseText).toContain('Additional Use Grant');
  });
});
