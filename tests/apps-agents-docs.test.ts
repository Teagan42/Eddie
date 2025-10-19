import { describe, expect, it } from 'vitest';
import { read } from './helpers/fs';

describe('apps AGENTS.md guidance', () => {
  it('tells agents to run both @eddie/api and @eddie/web for the web UI', () => {
    const content = read('apps/AGENTS.md');

    expect(content).toMatch(/Run both `@eddie\/api` and `@eddie\/web`/);
  });
});
