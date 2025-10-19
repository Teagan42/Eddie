import { describe, expect, it } from 'vitest';
import { read } from './helpers/fs';

const configurationDoc = read('docs/configuration.md');

describe('configuration documentation wizard discovery', () => {
  it('links to the CLI reference config command section', () => {
    expect(configurationDoc).toMatch(/cli-reference\.md#config-command/);
  });
});
