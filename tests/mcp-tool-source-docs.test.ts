import { beforeAll, describe, expect, it } from 'vitest';
import { read } from './helpers/fs';

let readme: string;

describe('MCP tool source README', () => {
  beforeAll(() => {
    readme = read('platform/integrations/mcp/README.md');
  });

  it('explains how the service boots transports and reuses sessions', () => {
    for (const phrase of ['McpToolSourceService', 'collectTools']) {
      expect(readme).toContain(phrase);
    }

    for (const pattern of [/streamable-http/i, /sse/i, /session cache/i]) {
      expect(readme).toMatch(pattern);
    }
  });

  it('documents capability discovery and payload normalization', () => {
    for (const pattern of [/tools\/list/i, /resources\/list/i, /prompts\/get/i]) {
      expect(readme).toMatch(pattern);
    }

    for (const phrase of ['ToolDefinition', 'metadata']) {
      expect(readme).toMatch(new RegExp(phrase, 'i'));
    }
  });

  it('covers configuration including auth strategies', () => {
    expect(readme).toContain('MCPToolSourceConfig');

    for (const pattern of [/auth/i, /basic/i, /bearer/i]) {
      expect(readme).toMatch(pattern);
    }
  });

  it('notes logging scope and performance metrics', () => {
    for (const phrase of ['LoggerService', 'mcp-tool-source']) {
      expect(readme).toContain(phrase);
    }

    expect(readme).toMatch(/durationMs/);
  });
});
