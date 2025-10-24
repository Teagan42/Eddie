import { describe, expect, it } from 'vitest';
import { read } from './helpers/fs';

const configurationDoc = read('docs/configuration.md');
const cliReferenceDoc = read('docs/cli-reference.md');
const readmeDoc = read('README.md');

describe('mem0 documentation coverage', () => {
  it('documents mem0 credentials, runtime overrides, and overview links', () => {
    for (const pattern of [
      /memory\.mem0/,
      /Mem0/,
      /vector store/i,
      /API key/i,
      /host/i,
    ]) {
      expect(configurationDoc).toMatch(pattern);
    }

    for (const pattern of [
      /--mem0-api-key/,
      /--mem0-host/,
      /EDDIE_CLI_MEM0_API_KEY/,
      /EDDIE_CLI_MEM0_HOST/,
    ]) {
      expect(cliReferenceDoc).toMatch(pattern);
    }

    for (const pattern of [
      /Mem0/,
      /configuration\.md#memory-configuration/,
    ]) {
      expect(readmeDoc).toMatch(pattern);
    }
  });
});
