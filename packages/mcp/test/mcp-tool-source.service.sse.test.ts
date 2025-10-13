import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { MCPToolSourceConfig } from "@eddie/config";

const hoisted = vi.hoisted(() => {
  const clientCtorCalls: Array<{ info: unknown; options: unknown }> = [];
  const clientInstances: Array<{
    connect: ReturnType<typeof vi.fn>;
    listTools: ReturnType<typeof vi.fn>;
    listResources: ReturnType<typeof vi.fn>;
    listPrompts: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const transportCalls: Array<{ url: URL; options: unknown }> = [];

  const Client = vi.fn().mockImplementation((info: unknown, options: unknown) => {
    clientCtorCalls.push({ info, options });
    const instance = {
      connect: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockResolvedValue({ tools: [] }),
      listResources: vi.fn().mockResolvedValue({ resources: [] }),
      listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    clientInstances.push(instance);
    return instance;
  });

  const SSEClientTransport = vi
    .fn()
    .mockImplementation((url: URL, options: unknown) => {
      transportCalls.push({ url, options });
      return {
        start: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        send: vi.fn().mockResolvedValue(undefined),
        setProtocolVersion: vi.fn(),
        sessionId: undefined as string | undefined,
      };
    });

  return {
    clientCtorCalls,
    clientInstances,
    transportCalls,
    Client,
    SSEClientTransport,
  };
});

vi.mock(
  "@modelcontextprotocol/sdk/client/index.js",
  () => ({
    Client: hoisted.Client,
  }),
  { virtual: true }
);

vi.mock(
  "@modelcontextprotocol/sdk/client/sse.js",
  () => ({
    SSEClientTransport: hoisted.SSEClientTransport,
  }),
  { virtual: true }
);

import { McpToolSourceService } from "../src/mcp-tool-source.service";

interface SseConfiguredSource extends MCPToolSourceConfig {
  transport: {
    type: "sse";
    url: string;
    headers?: Record<string, string>;
  };
}

describe("McpToolSourceService SSE transport", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.clientCtorCalls.length = 0;
    hoisted.clientInstances.length = 0;
    hoisted.transportCalls.length = 0;
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch should not be called directly"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("passes SSE-appropriate headers to the transport", async () => {
    const service = new McpToolSourceService();
    const config: SseConfiguredSource = {
      id: "mock",
      type: "mcp",
      url: "https://mcp.example.com/rpc",
      name: "Mock server",
      headers: { "x-custom": "value" },
      auth: { type: "bearer", token: "mock-token" },
      capabilities: { tools: {}, resources: {} },
      transport: {
        type: "sse",
        url: "https://mcp.example.com/events",
        headers: { "x-transport": "override" },
      },
    };

    await service.discoverSources([config]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(hoisted.SSEClientTransport).toHaveBeenCalledTimes(1);
    const [transportCall] = hoisted.transportCalls;
    expect(transportCall.url.href).toBe("https://mcp.example.com/events");
    const expectedHeaders = {
      accept: "text/event-stream",
      "x-custom": "value",
      "x-transport": "override",
      Authorization: "Bearer mock-token",
    };
    expect(transportCall.options).toEqual(
      expect.objectContaining({
        eventSourceInit: { headers: expectedHeaders },
        requestInit: { headers: expectedHeaders },
      })
    );
    const eventHeaders = (
      transportCall.options as {
        eventSourceInit?: { headers?: Record<string, string> };
      }
    ).eventSourceInit?.headers;
    expect(eventHeaders).toEqual(expectedHeaders);
  });
});
