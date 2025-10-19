import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const README_PATH = resolve(__dirname, '..', 'README.md');

describe('hooks README', () => {
  it('documents the hooks services and configuration options', () => {
    const content = readFileSync(README_PATH, 'utf8');

    expect(content).toMatch(/HooksService/);
    expect(content).toMatch(/HooksLoaderService/);
    expect(content).toMatch(/hooks\.directory/);
    expect(content).toMatch(/hooks\.modules/);
  });
});
