import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('@eddie/mcp dependencies', () => {
  const ROOT = new URL('..', import.meta.url);
  let packageJson: { dependencies?: Record<string, string> };
  let sdkVersion: string | undefined;

  beforeAll(() => {
    const packageJsonUrl = new URL('./platform/integrations/mcp/package.json', ROOT);
    packageJson = JSON.parse(readFileSync(packageJsonUrl, 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    sdkVersion = packageJson.dependencies?.['@modelcontextprotocol/sdk'];
  });

  it('declares @modelcontextprotocol/sdk with ^1.20.0 range', () => {
    expect(sdkVersion).toBe('^1.20.0');
  });

  it('pins the SDK dependency to the expected 1.20.0 release line', () => {
    expect(sdkVersion).toMatch(/^\^1\.20\.0$/);
  });
});
