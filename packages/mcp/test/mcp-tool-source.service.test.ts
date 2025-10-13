import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { MCPToolSourceConfig } from "@eddie/config";
import { McpToolSourceService } from "../src/mcp-tool-source.service";
import type { Logger } from "pino";
import type { LoggerService } from "@eddie/io";

const mockClientInstances: MockClientInstance[] = [];

interface MockClientInstance {
  connect: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  listResources: ReturnType<typeof vi.fn>;
  listPrompts: ReturnType<typeof vi.fn>;
  getPrompt: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  getServerCapabilities: ReturnType<typeof vi.fn>;
  getServerVersion: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  cacheToolOutputSchemas: ReturnType<typeof vi.fn>;
  constructorArgs: unknown[];
}

const mockTransportInstances: MockTransportInstance[] = [];

interface MockTransportInstance {
  url: URL;
  options: unknown;
}

vi.mock("@modelcontextprotocol/sdk", () => ({
  Client: class MockClient {
    connect = vi.fn().mockResolvedValue(undefined);
    listTools = vi.fn().mockResolvedValue({ tools: [] });
    listResources = vi.fn().mockResolvedValue({ resources: [] });
    listPrompts = vi.fn().mockResolvedValue({ prompts: [] });
    getPrompt = vi.fn();
    callTool = vi.fn();
    getServerCapabilities = vi.fn().mockReturnValue({ tools: { list: true } });
    getServerVersion = vi.fn().mockReturnValue({ name: "mock-server", version: "1.0.0" });
    close = vi.fn().mockResolvedValue(undefined);
    cacheToolOutputSchemas = vi.fn();

    constructor(...args: unknown[]) {
      this.constructorArgs = args;
      mockClientInstances.push(this as unknown as MockClientInstance);
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp", () => ({
  StreamableHTTPClientTransport: class MockTransport {
    constructor(public url: URL, public options: unknown) {
      mockTransportInstances.push(this as unknown as MockTransportInstance);
    }
  },
}));

const createLogger = () => {
  const logger: Partial<Logger> = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn().mockImplementation(() => logger as Logger),
  };
  return logger as Logger;
};

const createLoggerService = (logger: Logger): LoggerService => ({
  getLogger: vi.fn().mockReturnValue(logger),
} as unknown as LoggerService);

describe("McpToolSourceService", () => {
  beforeEach(() => {
    mockClientInstances.length = 0;
    mockTransportInstances.length = 0;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the SDK client to initialize and logs server capabilities", async () => {
    const logger = createLogger();
    const loggerService = createLoggerService(logger);
    const service = new McpToolSourceService(loggerService);
    const source: MCPToolSourceConfig = {
      id: "default",
      type: "mcp",
      url: "https://example.com/mcp",
      capabilities: { tools: { call: true } },
    };

    await service.discoverSources([source]);

    expect(mockClientInstances).toHaveLength(1);
    const instance = mockClientInstances[0];
    expect(instance.constructorArgs[0]).toEqual({ name: "eddie", version: expect.any(String) });
    expect(instance.constructorArgs[1]).toEqual({ capabilities: source.capabilities });
    expect(instance.connect).toHaveBeenCalledTimes(1);
    expect(mockTransportInstances).toHaveLength(1);
    expect(mockTransportInstances[0].url).toBeInstanceOf(URL);
    expect(mockTransportInstances[0].url.href).toBe(source.url);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "mcp.initialize",
        sourceId: source.id,
        serverName: "mock-server",
        serverVersion: "1.0.0",
        capabilities: { tools: { list: true } },
        transport: "streamable-http",
      }),
      "Connected to MCP server"
    );
  });
});
