import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import yaml from 'yaml';

import { read } from './helpers/fs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const datasetRoot = 'examples/demo-agent-screenshots';
const serializedConfig = read(`${datasetRoot}/eddie.config.yaml`);
const parsedConfig = yaml.parse(serializedConfig);
const seedEntries = [
  ['chatSessions', 'data/chat-sessions.json'],
  ['agentInvocations', 'data/agent-invocations.json'],
  ['traces', 'data/traces.json'],
  ['logs', 'data/logs.json'],
  ['runtimeConfig', 'data/runtime-config.json'],
] as const;
const readmeExpectations = [
  /demo screenshot/i,
  /chat sessions/i,
  /trace timeline/i,
] as const;

describe('demo agent screenshot seeds', () => {
  it('exposes demo seed paths in the example config', () => {
    expect(parsedConfig.demoSeeds).toBeDefined();

    for (const [key, relativePath] of seedEntries) {
      expect(parsedConfig.demoSeeds).toHaveProperty(key);
      expect(parsedConfig.demoSeeds[key]).toContain(relativePath);
    }
  });

  it.each(seedEntries)('keeps %s fixture in sync with demoSeeds entry', (key, relativePath) => {
    const absolutePath = join(repoRoot, datasetRoot, relativePath);

    expect(existsSync(absolutePath)).toBe(true);

    const contents = read(`${datasetRoot}/${relativePath}`);
    expect(() => JSON.parse(contents)).not.toThrow();

    expect(parsedConfig.demoSeeds[key]).toContain(relativePath);
  });

  it('documents the dataset expectations in the README', () => {
    const readme = read(`${datasetRoot}/README.md`);

    for (const expectation of readmeExpectations) {
      expect(readme).toMatch(expectation);
    }
  });
});
