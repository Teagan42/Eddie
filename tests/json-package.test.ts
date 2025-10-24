import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const manifestUrl = new URL('../platform/testing/json/package.json', import.meta.url);
const loadManifest = () => JSON.parse(readFileSync(manifestUrl, 'utf8'));

describe('json package manifest', () => {
  it('exposes a build script for benchmark workflows', () => {
    const manifest = loadManifest();

    expect(typeof manifest.scripts?.build).toBe('string');
    expect(manifest.scripts.build.length).toBeGreaterThan(0);
  });

  it('exposes a lint script for workspace linting', () => {
    const manifest = loadManifest();

    expect(typeof manifest.scripts?.lint).toBe('string');
    expect(manifest.scripts.lint.length).toBeGreaterThan(0);
  });
});
