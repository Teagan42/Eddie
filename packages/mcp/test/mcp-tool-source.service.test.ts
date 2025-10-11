import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MCPToolSourceConfig } from "@eddie/config";

const connectMock = vi.fn();
const disconnectMock = vi.fn();
const listToolsMock = vi.fn();
const listResourcesMock = vi.fn();
const listPromptsMock = vi.fn();
const getPromptMock = vi.fn();
const callToolMock = vi.fn();

const clientInstance = {
  connect: connectMock,
  close: disconnectMock,
  listTools: listToolsMock,
  listResources: listResourcesMock,
  listPrompts: listPromptsMock,
  getPrompt: getPromptMock,
  callTool: callToolMock,
};

const clientConstructorMock = vi.hoisted(() =>
  vi.fn(() => clientInstance)
);

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: clientConstructorMock,
}));

const streamableHttpTransportMock = vi.hoisted(() =>
  vi.fn(() => ({
    start: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }))
);

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: streamableHttpTransportMock,
}));

const sseTransportMock = vi.hoisted(() =>
  vi.fn(() => ({
    start: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }))
);

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: sseTransportMock,
}));

const errorCodes = vi.hoisted(() => ({ MethodNotFound: -32601 } as const));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  CompatibilityCallToolResultSchema: {},
  ErrorCode: errorCodes,
  McpError: class McpError extends Error {
    code: number;

    constructor(message?: string, options?: { code?: number }) {
      super(message);
      this.code = options?.code ?? errorCodes.MethodNotFound;
    }
  },
}));

// Import after mocks so they take effect
import { McpToolSourceService } from "../src/mcp-tool-source.service";

describe("McpToolSourceService", () => {
  beforeEach(() => {
    clientConstructorMock.mockClear();
    connectMock.mockReset();
    disconnectMock.mockReset();
    listToolsMock.mockReset();
    listResourcesMock.mockReset();
    listPromptsMock.mockReset();
    getPromptMock.mockReset();
    callToolMock.mockReset();
    streamableHttpTransportMock.mockReset();
    sseTransportMock.mockReset();

    connectMock.mockResolvedValue(undefined);
    disconnectMock.mockResolvedValue(undefined);
    listToolsMock.mockResolvedValue({ tools: [] });
    listResourcesMock.mockResolvedValue({ resources: [] });
    listPromptsMock.mockResolvedValue({ prompts: [] });
    getPromptMock.mockResolvedValue({ prompt: { name: "", messages: [] } });
    callToolMock.mockResolvedValue({ schema: "", content: "" });
  });

  it("creates an SSE transport when the source requests it", async () => {
    const service = new McpToolSourceService();
    const config = {
      id: "sse-source",
      type: "mcp",
      url: "https://example.com/mcp",
      transport: { type: "sse" },
    } as unknown as MCPToolSourceConfig;

    await service.collectTools([config]);

    expect(sseTransportMock).toHaveBeenCalledTimes(1);
    expect(streamableHttpTransportMock).not.toHaveBeenCalled();
  });

  it("reuses the same MCP client session for tool invocations", async () => {
    const service = new McpToolSourceService();
    const config = {
      id: "streamable-source",
      type: "mcp",
      url: "https://example.com/mcp",
    } as unknown as MCPToolSourceConfig;

    const toolName = "example";
    listToolsMock.mockResolvedValue({
      tools: [
        {
          name: toolName,
          description: "Example tool",
          inputSchema: {},
        },
      ],
    });
    callToolMock.mockResolvedValue({ schema: "", content: "" });

    const discovery = await service.collectTools([config]);
    const toolHandler = discovery.tools.find((tool) => tool.name === toolName);
    expect(toolHandler).toBeDefined();
    expect(clientConstructorMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);

    await toolHandler!.handler({ argument: "value" });

    expect(clientConstructorMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(callToolMock).toHaveBeenCalledWith(
      {
        name: toolName,
        arguments: { argument: "value" },
      },
      expect.anything()
    );
  });
});
