import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { MCPToolSourceConfig } from "@eddie/config";
import { McpToolSourceService } from "../src/mcp-tool-source.service";
import type { Logger } from "pino";
import type { LoggerService } from "@eddie/io";

const mockClientInstances: MockClientInstance[] = [];
const mockClientConnect = vi.fn();

interface MockClientInstance {
  connect: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  listResources: ReturnType<typeof vi.fn>;
  listPrompts: ReturnType<typeof vi.fn>;
  getPrompt: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
  getServerCapabilities: ReturnType<typeof vi.fn>;
  getServerVersion: ReturnType<typeof vi.fn>;
  getServerInfo: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  cacheToolOutputSchemas: ReturnType<typeof vi.fn>;
  constructorArgs: unknown[];
}

const mockTransportInstances: MockTransportInstance[] = [];
const mockSseTransportInstances: MockSseTransportInstance[] = [];

interface MockTransportInstance {
  url: URL;
  options: unknown;
}

interface MockSseTransportInstance {
  url: URL;
  options: unknown;
}

const mockServerCapabilities = vi.fn().mockReturnValue({ tools: { list: true } });
const mockServerVersion = vi
  .fn()
  .mockReturnValue({ name: "mock-server", version: "1.0.0" });
const mockServerInfo = vi
  .fn()
  .mockReturnValue({ name: "mock-server", version: "1.0.0" });

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    connect = mockClientConnect;
    listTools = vi.fn().mockResolvedValue({ tools: [] });
    listResources = vi.fn().mockResolvedValue({ resources: [] });
    listPrompts = vi.fn().mockResolvedValue({ prompts: [] });
    getPrompt = vi.fn();
    callTool = vi.fn();
    getServerCapabilities = mockServerCapabilities;
    getServerVersion = mockServerVersion;
    getServerInfo = mockServerInfo;
    close = vi.fn().mockResolvedValue(undefined);
    cacheToolOutputSchemas = vi.fn();

    constructor(...args: unknown[]) {
      this.constructorArgs = args;
      mockClientInstances.push(this as unknown as MockClientInstance);
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockTransport {
    sessionId?: string;

    constructor(public url: URL, public options: unknown) {
      mockTransportInstances.push(this as unknown as MockTransportInstance);
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class MockSseTransport {
    constructor(public url: URL, public options: unknown) {
      mockSseTransportInstances.push(
        this as unknown as MockSseTransportInstance
      );
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

const createService = () => {
  const logger = createLogger();
  const loggerService = createLoggerService(logger);
  const service = new McpToolSourceService(loggerService);

  return { service, logger, loggerService };
};

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const getTransportSessionId = (index: number) =>
  (mockTransportInstances[index].options as { sessionId?: string }).sessionId;

describe("McpToolSourceService", () => {
  beforeEach(() => {
    mockClientInstances.length = 0;
    mockTransportInstances.length = 0;
    mockSseTransportInstances.length = 0;
    mockClientConnect.mockReset();
    mockClientConnect.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
    mockServerCapabilities.mockReturnValue({ tools: { list: true } });
    mockServerVersion.mockReturnValue({ name: "mock-server", version: "1.0.0" });
    mockServerInfo.mockReturnValue({ name: "mock-server", version: "1.0.0" });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("unwraps tool call results returned under a result property", async () => {
    const logger = createLogger();
    const loggerService = createLoggerService(logger);
    const service = new McpToolSourceService(loggerService);
    const source: MCPToolSourceConfig = {
      id: "nested-result",
      type: "mcp",
      url: "https://example.com/mcp",
    };

    mockServerCapabilities.mockReturnValue({ tools: { list: true, call: true } });
    mockClientConnect.mockImplementation(async () => {
      const instance = mockClientInstances.at(-1);
      if (!instance) {
        return;
      }

      if (mockClientInstances.length === 1) {
        instance.listTools.mockResolvedValue({
          tools: [
            {
              name: "echo",
              description: "Echo", // description required to form ToolDefinition
              inputSchema: { type: "object", properties: {} },
            },
          ],
        });
      }

      if (mockClientInstances.length === 2) {
        instance.callTool.mockResolvedValue({
          result: {
            content: [
              {
                type: "text",
                text: "hello world",
              },
            ],
          },
        });
      }
    });

    const discoveries = await service.discoverSources([source]);
    expect(discoveries[0]?.tools).toHaveLength(1);
    const handler = discoveries[0]?.tools[0]?.handler;
    expect(handler).toBeTypeOf("function");

    const result = await handler?.({});

    expect(result).toEqual({
      schema: "mcp.tool.result",
      content: "hello world",
    });
  });

  it("returns structured tool results when provided", async () => {
    const logger = createLogger();
    const loggerService = createLoggerService(logger);
    const service = new McpToolSourceService(loggerService);
    const source: MCPToolSourceConfig = {
      id: "structured-result",
      type: "mcp",
      url: "https://example.com/mcp",
    };

    mockServerCapabilities.mockReturnValue({ tools: { list: true, call: true } });
    mockClientConnect.mockImplementation(async () => {
      const instance = mockClientInstances.at(-1);
      if (!instance) {
        return;
      }

      if (mockClientInstances.length === 1) {
        instance.listTools.mockResolvedValue({
          tools: [
            {
              name: "echo",
              description: "Echo",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        });
      }

      if (mockClientInstances.length === 2) {
        instance.callTool.mockResolvedValue({
          result: {
            content: [
              {
                type: "text",
                text: "ignored",
              },
            ],
            structuredContent: {
              schema: "custom/result",
              content: "summary",
              data: { foo: "bar" },
              metadata: { correlationId: "abc" },
            },
          },
        });
      }
    });

    const discoveries = await service.discoverSources([source]);
    const handler = discoveries[0]?.tools[0]?.handler;
    expect(handler).toBeTypeOf("function");

    const result = await handler?.({});

    expect(result).toEqual({
      schema: "custom/result",
      content: "summary",
      data: { foo: "bar" },
      metadata: { correlationId: "abc" },
    });
  });

  it("omits output schemas that do not declare an identifier", async () => {
    const logger = createLogger();
    const loggerService = createLoggerService(logger);
    const service = new McpToolSourceService(loggerService);
    const source: MCPToolSourceConfig = {
      id: "missing-schema-id",
      type: "mcp",
      url: "https://example.com/mcp",
    };

    mockServerCapabilities.mockReturnValue({ tools: { list: true } });
    mockClientConnect.mockImplementation(async () => {
      const instance = mockClientInstances.at(-1);
      if (!instance) {
        return;
      }

      if (mockClientInstances.length === 1) {
        instance.listTools.mockResolvedValue({
          tools: [
            {
              name: "query-media",
              description: "Queries media library",
              inputSchema: { type: "object", properties: {} },
              outputSchema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          ],
        });
      }
    });

    const discoveries = await service.discoverSources([source]);
    const tool = discoveries[0]?.tools[0];

    expect(tool?.outputSchema).toBeUndefined();
  });

  it("unwraps tool listings returned under a result property", async () => {
    const { service } = createService();
    const source: MCPToolSourceConfig = {
      id: "nested-list-result",
      type: "mcp",
      url: "https://example.com/mcp",
    };

    mockServerCapabilities.mockReturnValue({ tools: { list: true } });
    mockClientConnect.mockImplementation(async () => {
      const instance = mockClientInstances.at(-1);
      if (!instance) {
        return;
      }

      if (mockClientInstances.length === 1) {
        instance.listTools.mockResolvedValue({
          result: {
            tools: [
              {
                name: "echo",
                description: "Echo tool",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        });
      }
    });

    const discoveries = await service.discoverSources([source]);

    expect(discoveries[0]?.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "echo",
          description: "Echo tool",
        }),
      ])
    );
  });

  it("unwraps prompt listings returned under a result property", async () => {
    const { service } = createService();
    const source: MCPToolSourceConfig = {
      id: "nested-prompts-result",
      type: "mcp",
      url: "https://example.com/mcp",
    };

    mockServerCapabilities.mockReturnValue({
      tools: { list: true },
      prompts: { list: true, get: true },
    });

    mockClientConnect.mockImplementation(async () => {
      const instance = mockClientInstances.at(-1);
      if (!instance) {
        return;
      }

      instance.listPrompts.mockResolvedValue({
        result: {
          prompts: [
            {
              name: "welcome",
              description: "Welcomes the user",
            },
          ],
        },
      });

      instance.getPrompt.mockImplementation(async ({ name }: { name: string }) => {
        if (name !== "welcome") {
          throw new Error(`Unexpected prompt ${name}`);
        }

        return {
          result: {
            prompt: {
              name: "welcome",
              description: "Welcomes the user",
              arguments: [],
              messages: [],
            },
          },
        };
      });
    });

    const discoveries = await service.discoverSources([source]);

    expect(discoveries[0]?.prompts).toEqual([
      expect.objectContaining({
        name: "welcome",
        description: "Welcomes the user",
        arguments: [],
        messages: [],
      }),
    ]);
  });

  it("skips preloading prompts that declare arguments", async () => {
    const { service } = createService();
    const source: MCPToolSourceConfig = {
      id: "prompts-with-arguments",
      type: "mcp",
      url: "https://example.com/mcp",
    };

    mockServerCapabilities.mockReturnValue({
      tools: { list: true },
      prompts: { list: true, get: true },
    });

    mockClientConnect.mockImplementation(async () => {
      const instance = mockClientInstances.at(-1);
      if (!instance) {
        return;
      }

      instance.listPrompts.mockResolvedValue({
        prompts: [
          {
            name: "no-args",
            description: "Does not require arguments",
          },
          {
            name: "needs-args",
            description: "Requires arguments",
            arguments: [
              {
                name: "topic",
                required: true,
              },
            ],
          },
        ],
      });

      instance.getPrompt.mockImplementation(async ({ name }: { name: string }) => {
        if (name === "needs-args") {
          throw new Error("prompts with arguments should not be pre-loaded");
        }

        return {
          prompt: {
            name: "no-args",
            description: "Does not require arguments",
            arguments: [],
            messages: [],
          },
        };
      });
    });

    const discoveries = await service.discoverSources([source]);

    expect(discoveries[0]?.prompts).toEqual([
      expect.objectContaining({
        name: "no-args",
        description: "Does not require arguments",
        arguments: [],
        messages: [],
      }),
    ]);

    const instance = mockClientInstances.at(-1);
    expect(instance?.getPrompt).toHaveBeenCalledTimes(1);
    expect(instance?.getPrompt).toHaveBeenCalledWith({ name: "no-args" });
  });

  it("unwraps resource listings returned under a result property", async () => {
    const { service } = createService();
    const source: MCPToolSourceConfig = {
      id: "nested-resources-result",
      type: "mcp",
      url: "https://example.com/mcp",
    };

    mockServerCapabilities.mockReturnValue({
      tools: { list: true },
      resources: { list: true },
    });

    mockClientConnect.mockImplementation(async () => {
      const instance = mockClientInstances.at(-1);
      if (!instance) {
        return;
      }

      instance.listResources.mockResolvedValue({
        result: {
          resources: [
            {
              uri: "resource://example",
              name: "Example",
              description: "An example resource",
            },
          ],
        },
      });
    });

    const discoveries = await service.discoverSources([source]);

    expect(discoveries[0]?.resources).toEqual([
      expect.objectContaining({
        uri: "resource://example",
        name: "Example",
        description: "An example resource",
      }),
    ]);
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

  it("skips resource discovery when the server lacks resources support", async () => {
    const logger = createLogger();
    const loggerService = createLoggerService(logger);
    const service = new McpToolSourceService(loggerService);
    const source: MCPToolSourceConfig = {
      id: "no-resources",
      type: "mcp",
      url: "https://example.com/mcp",
    };

    mockServerCapabilities.mockReturnValue({ tools: { list: true } });

    const discoveries = await service.discoverSources([source]);

    expect(mockClientInstances).toHaveLength(1);
    const instance = mockClientInstances[0];
    expect(instance.listResources).not.toHaveBeenCalled();
    expect(discoveries).toEqual([
      {
        sourceId: source.id,
        tools: [],
        resources: [],
        prompts: [],
      },
    ]);
  });

  it("uses the SSE transport when configured", async () => {
    const logger = createLogger();
    const loggerService = createLoggerService(logger);
    const service = new McpToolSourceService(loggerService);
    const source = {
      id: "sse",
      type: "mcp",
      url: "https://example.com/mcp-sse",
      transport: "sse",
    } as MCPToolSourceConfig;

    await service.discoverSources([source]);

    expect(mockSseTransportInstances).toHaveLength(1);
    expect(mockSseTransportInstances[0].url).toBeInstanceOf(URL);
    expect(mockSseTransportInstances[0].url.href).toBe(source.url);
    expect(mockTransportInstances).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "mcp.initialize",
        sourceId: source.id,
        transport: "sse",
      }),
      "Connected to MCP server"
    );
  });

  it("reuses the streamable session id assigned during connect", async () => {
    const logger = createLogger();
    const loggerService = createLoggerService(logger);
    const service = new McpToolSourceService(loggerService);
    const source: MCPToolSourceConfig = {
      id: "default",
      type: "mcp",
      url: "https://example.com/mcp",
    };

    mockClientConnect.mockImplementation(async (transport: { sessionId?: string }) => {
      transport.sessionId = "session-123";
    });

    await service.discoverSources([source]);

    mockClientConnect.mockImplementation(async () => undefined);

    await service.discoverSources([source]);

    expect(mockTransportInstances).toHaveLength(2);
    expect(getTransportSessionId(0)).toBeUndefined();
    expect(getTransportSessionId(1)).toBe("session-123");
  });

  it("constructs with a default logger when no LoggerService is provided", async () => {
    const service = new McpToolSourceService();
    const source: MCPToolSourceConfig = {
      id: "default",
      type: "mcp",
      url: "https://example.com/mcp",
      capabilities: { tools: { call: true } },
    };

    await expect(service.discoverSources([source])).resolves.toBeInstanceOf(Array);
  });

  it("derives server identity from getServerInfo when provided", async () => {
    const logger = createLogger();
    const loggerService = createLoggerService(logger);
    const service = new McpToolSourceService(loggerService);
    const source: MCPToolSourceConfig = {
      id: "default",
      type: "mcp",
      url: "https://example.com/mcp",
      capabilities: { tools: { call: true } },
    };

    mockServerInfo.mockReturnValue({ name: "info-server", version: "9.9.9" });
    mockServerVersion.mockReturnValue(undefined);

    await service.discoverSources([source]);

    expect(mockServerInfo).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "mcp.initialize",
        sourceId: source.id,
        serverName: "info-server",
        serverVersion: "9.9.9",
      }),
      "Connected to MCP server"
    );
  });

  it("runs discovery for all sources concurrently and preserves ordering", async () => {
    const logger = createLogger();
    const loggerService = createLoggerService(logger);
    const service = new McpToolSourceService(loggerService);
    const sources: MCPToolSourceConfig[] = [
      { id: "one", type: "mcp", url: "https://example.com/one" },
      { id: "two", type: "mcp", url: "https://example.com/two" },
    ];

    const firstDeferred = createDeferred<{
      tools: unknown[];
      resources: unknown[];
      prompts: unknown[];
    }>();
    const secondDeferred = createDeferred<{
      tools: unknown[];
      resources: unknown[];
      prompts: unknown[];
    }>();

    const discoverSpy = vi
      .spyOn(service as unknown as { discoverSource: unknown }, "discoverSource")
      .mockImplementationOnce(() => firstDeferred.promise)
      .mockImplementationOnce(() => secondDeferred.promise);

    const discoveryPromise = service.discoverSources(sources);

    expect(discoverSpy).toHaveBeenCalledTimes(2);
    expect(discoverSpy).toHaveBeenNthCalledWith(1, sources[0]);
    expect(discoverSpy).toHaveBeenNthCalledWith(2, sources[1]);

    const secondResult = {
      tools: [{ name: "second", jsonSchema: {}, handler: vi.fn() }],
      resources: [{ name: "resource-two", uri: "two://" }],
      prompts: [{ name: "prompt-two", messages: [] }],
    };
    const firstResult = {
      tools: [{ name: "first", jsonSchema: {}, handler: vi.fn() }],
      resources: [{ name: "resource-one", uri: "one://" }],
      prompts: [{ name: "prompt-one", messages: [] }],
    };

    secondDeferred.resolve(secondResult);
    firstDeferred.resolve(firstResult);

    await expect(discoveryPromise).resolves.toEqual([
      {
        sourceId: sources[0].id,
        tools: firstResult.tools,
        resources: firstResult.resources,
        prompts: firstResult.prompts,
      },
      {
        sourceId: sources[1].id,
        tools: secondResult.tools,
        resources: secondResult.resources,
        prompts: secondResult.prompts,
      },
    ]);

    discoverSpy.mockRestore();
  });
});

describe("SDK module loading", () => {
  const serviceSourcePath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../src/mcp-tool-source.service.ts"
  );

  it("avoids static imports for the streamable transport", () => {
    const source = readFileSync(serviceSourcePath, "utf8");

    expect(source).not.toMatch(/^import\s+[^\n]*streamableHttp/m);
  });

  it("avoids static imports for the sse transport", () => {
    const source = readFileSync(serviceSourcePath, "utf8");

    expect(source).not.toMatch(/^import\s+[^\n]*sse/m);
  });

  it("avoids referencing dist esm client types directly", () => {
    const source = readFileSync(serviceSourcePath, "utf8");

    expect(source).not.toContain("@modelcontextprotocol/sdk/dist/esm/client");
  });
});
