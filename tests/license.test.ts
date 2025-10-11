import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);

function readRootFile(path: string) {
  return readFileSync(new URL(path, ROOT), 'utf8');
}

describe('project licensing', () => {
  let packageJson: { license: string };
  let licenseText: string;
  let readmeText: string;
  let thirdPartyNotices: string;

  beforeAll(() => {
    packageJson = JSON.parse(readRootFile('./package.json'));
    licenseText = readRootFile('./LICENSE');
    readmeText = readRootFile('./README.md');
    thirdPartyNotices = readRootFile('./THIRD_PARTY_NOTICES.md');
  });

  it('declares a monetization-friendly license in package.json', () => {
    expect(packageJson.license).toBe('BUSL-1.1');
  });

  it('provides the Business Source License text for monetization terms', () => {
    expect(licenseText).toContain('Business Source License 1.1');
    expect(licenseText).toContain('Additional Use Grant');
  });

  it('attributes the Business Source License to ConstructorFleet L.L.C', () => {
    expect(licenseText).toContain('Licensor: ConstructorFleet L.L.C');
  });

  it('documents ConstructorFleet L.L.C ownership in the README', () => {
    expect(readmeText).toContain('© 2025 ConstructorFleet L.L.C');
  });

  it('lists the NestJS CQRS package in third-party notices', () => {
    expect(thirdPartyNotices).toContain('@nestjs/cqrs');
  });
});
