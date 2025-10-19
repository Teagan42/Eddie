import { describe, expect, it } from 'vitest';

import { read } from './helpers/fs';

describe('configuration preset docs', () => {
  it('documents the demo-web preset and demo seeds', () => {
    const doc = read('docs/configuration-presets.md');

    expect(doc).toMatch(/demo-web/);
    expect(doc).toMatch(/--preset demo-web/);
    expect(doc).toMatch(/demoSeeds/);
  });
});
