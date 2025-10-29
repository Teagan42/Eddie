import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const manifestUrl = new URL('../package.json', import.meta.url);
const loadManifest = () => JSON.parse(readFileSync(manifestUrl, 'utf8')) as Record<string, unknown>;

const extractVersion = (value: unknown): [number, number, number] => {
  expect(typeof value).toBe('string');

  const version = (value as string).replace(/^[^0-9]*/, '');
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);

  expect(match).not.toBeNull();

  return match!.slice(1, 4).map((part) => Number.parseInt(part, 10)) as [number, number, number];
};

const isAtLeast = (actual: [number, number, number], minimum: [number, number, number]) => {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) {
      return true;
    }

    if (actual[index] < minimum[index]) {
      return false;
    }
  }

  return true;
};

describe('dependency overrides', () => {
  it('pins axios and undici to secure minimum versions', () => {
    const manifest = loadManifest();

    expect(manifest.overrides).toBeDefined();
    expect(typeof manifest.overrides).toBe('object');

    const overrides = manifest.overrides as Record<string, unknown>;

    const assertOverrideAtLeast = (
      name: string,
      minimum: [number, number, number],
    ) => {
      const version = extractVersion(overrides[name]);

      expect(isAtLeast(version, minimum)).toBe(true);
    };

    assertOverrideAtLeast('axios', [1, 12, 0]);
    assertOverrideAtLeast('undici', [5, 29, 0]);
  });
});
