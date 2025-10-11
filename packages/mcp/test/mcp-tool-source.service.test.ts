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

vi.mock("@modelcontextprotocol/sdk/client", () => ({
  Client: vi.fn(() => clientInstance),
}));

const streamableHttpTransportMock = vi.hoisted(() =>
  vi.fn(() => ({
    start: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }))
);

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp", () => ({
  StreamableHTTPClientTransport: streamableHttpTransportMock,
}));

const sseTransportMock = vi.hoisted(() =>
  vi.fn(() => ({
    start: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }))
);

vi.mock("@modelcontextprotocol/sdk/client/sse", () => ({
  SSEClientTransport: sseTransportMock,
}));

// Import after mocks so they take effect
import { McpToolSourceService } from "../src/mcp-tool-source.service";

describe("McpToolSourceService", () => {
  beforeEach(() => {
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

  it("omits metadata when tool results report a null metadata payload", async () => {
    const service = new McpToolSourceService();
    const config = {
      id: "metadata-source",
      type: "mcp",
      url: "https://example.com/mcp",
    } as unknown as MCPToolSourceConfig;

    listToolsMock.mockResolvedValue({
      tools: [
        {
          name: "echo",
          description: "Echo tool",
          inputSchema: { type: "object" },
        },
      ],
    });

    callToolMock.mockResolvedValueOnce({
      schema: "test.schema",
      content: "ok",
      metadata: null,
    });

    const { tools } = await service.collectTools([config]);
    expect(tools).toHaveLength(1);

    const result = await tools[0].handler({});

    expect(result).toEqual({
      schema: "test.schema",
      content: "ok",
    });
  });
});
