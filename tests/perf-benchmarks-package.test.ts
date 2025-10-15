import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const manifestUrl = new URL('../packages/perf-benchmarks/package.json', import.meta.url);
const loadManifest = () => JSON.parse(readFileSync(manifestUrl, 'utf8'));
const expectedScripts = Object.freeze({
  lint: 'eslint --no-error-on-unmatched-pattern .',
  build: expect.any(String),
  bench: 'vitest bench',
});

describe('@eddie/perf-benchmarks package manifest', () => {
  it('declares the perf benchmarks workspace as private', () => {
    const packageJson = loadManifest();
    expect(packageJson.name).toBe('@eddie/perf-benchmarks');
    expect(packageJson.private).toBe(true);
  });

  it('exposes lint, build, and bench scripts for perf workflows', () => {
    const packageJson = loadManifest();
    expect(packageJson.scripts).toMatchObject(expectedScripts);
  });
});
