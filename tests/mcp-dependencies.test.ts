import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('@eddie/mcp dependencies', () => {
  const ROOT = new URL('..', import.meta.url);
  let packageJson: { dependencies?: Record<string, string> };

  beforeAll(() => {
    const packageJsonUrl = new URL('./platform/integrations/mcp/package.json', ROOT);
    packageJson = JSON.parse(readFileSync(packageJsonUrl, 'utf8')) as {
      dependencies?: Record<string, string>;
    };
  });

  it('declares @modelcontextprotocol/sdk with ^1.20.0 range', () => {
    expect(packageJson.dependencies?.['@modelcontextprotocol/sdk']).toBe('^1.20.0');
  });
});
