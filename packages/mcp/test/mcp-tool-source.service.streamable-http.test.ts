import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { MCPToolSourceConfig } from "@eddie/config";
import type { ToolDefinition } from "@eddie/types";

const hoisted = vi.hoisted(() => {
  const toolSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  } as const;

  const outputSchema = {
    $id: "schema://mock/tool-result",
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["items"],
  } as const;

  const promptArguments = [
    {
      name: "topic",
      description: "Topic to explore",
      required: true,
      schema: { type: "string" },
    },
  ] as const;

  const promptMessages = [
    {
      role: "system",
      content: [
        { type: "text", text: "You are a helpful assistant for mock data." },
      ],
    },
  ] as const;

  const promptDefinition = {
    name: "mock_prompt",
    description: "Provides a mock prompt",
    arguments: promptArguments,
    messages: promptMessages,
  } as const;

  const listToolsResult = {
    tools: [
      {
        name: "mock_search",
        description: "Searches mock data",
        inputSchema: toolSchema,
        outputSchema,
      },
    ],
  };

  const listResourcesResult = {
    resources: [
      {
        name: "mock-docs",
        uri: "https://example.com/docs",
        description: "Mock documentation",
        mimeType: "text/plain",
        metadata: { version: "1.0.0" },
      },
    ],
  };

  const listPromptsResult = {
    prompts: [
      {
        name: "mock_prompt",
        description: "Provides a mock prompt",
        arguments: promptArguments,
      },
    ],
  };

  const clientInstances: Array<{
    connect: ReturnType<typeof vi.fn>;
    listTools: ReturnType<typeof vi.fn>;
    listResources: ReturnType<typeof vi.fn>;
    listPrompts: ReturnType<typeof vi.fn>;
    getPrompt: ReturnType<typeof vi.fn>;
    callTool: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];

  const clientCtorCalls: Array<{
    info: unknown;
    options: unknown;
  }> = [];

  const Client = vi.fn().mockImplementation((info: unknown, options: unknown) => {
    clientCtorCalls.push({ info, options });
    const instance = {
      connect: vi.fn().mockResolvedValue(undefined),
      listTools: vi.fn().mockResolvedValue(structuredClone(listToolsResult)),
      listResources: vi.fn().mockResolvedValue(structuredClone(listResourcesResult)),
      listPrompts: vi.fn().mockResolvedValue(structuredClone(listPromptsResult)),
      getPrompt: vi.fn().mockResolvedValue({ prompt: structuredClone(promptDefinition) }),
      callTool: vi
        .fn()
        .mockImplementation(async (params: { name: string; arguments?: Record<string, unknown> }) => ({
          schema: outputSchema.$id,
          content: `results for ${params.arguments?.query}`,
          data: { items: ["alpha", "beta"] },
          metadata: { tookMs: 12 },
        })),
      close: vi.fn().mockResolvedValue(undefined),
    };
    clientInstances.push(instance);
    return instance;
  });

  const transportCalls: Array<{
    url: URL;
    options: unknown;
  }> = [];

  const StreamableHTTPClientTransport = vi
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
    toolSchema,
    outputSchema,
    promptArguments,
    promptMessages,
    promptDefinition,
    listToolsResult,
    listResourcesResult,
    listPromptsResult,
    clientInstances,
    clientCtorCalls,
    transportCalls,
    Client,
    StreamableHTTPClientTransport,
  };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: hoisted.Client,
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: hoisted.StreamableHTTPClientTransport,
}));

interface StreamableHttpConfiguredSource extends MCPToolSourceConfig {
  transport: {
    type: "streamable-http";
    url: string;
    headers?: Record<string, string>;
  };
}

type ToolHandler = NonNullable<ToolDefinition["handler"]>;

import { McpToolSourceService } from "../src/mcp-tool-source.service";

describe("McpToolSourceService streamable HTTP transport", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.clientInstances.length = 0;
    hoisted.clientCtorCalls.length = 0;
    hoisted.transportCalls.length = 0;
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch should not be called directly"));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("connects with the streamable HTTP transport and executes tools via the MCP client", async () => {
    const service = new McpToolSourceService();
    const config: StreamableHttpConfiguredSource = {
      id: "mock",
      type: "mcp",
      url: "https://mcp.example.com/rpc",
      name: "Mock server",
      headers: { "x-custom": "value" },
      auth: { type: "bearer", token: "mock-token" },
      capabilities: { tools: {}, resources: {} },
      transport: {
        type: "streamable-http",
        url: "https://mcp.example.com/rpc",
        headers: { "x-transport": "override" },
      },
    };

    const discoveries = await service.discoverSources([config]);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(hoisted.StreamableHTTPClientTransport).toHaveBeenCalledTimes(1);
    const [transportCall] = hoisted.transportCalls;
    expect(transportCall.url.href).toBe("https://mcp.example.com/rpc");
    expect(transportCall.options).toEqual(
      expect.objectContaining({
        requestInit: {
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-custom": "value",
            "x-transport": "override",
            Authorization: "Bearer mock-token",
          },
        },
      })
    );

    expect(hoisted.Client).toHaveBeenCalledTimes(1);
    const [clientCtor] = hoisted.clientCtorCalls;
    expect(clientCtor.info).toEqual({ name: "eddie", version: expect.any(String) });
    expect(clientCtor.options).toEqual({ capabilities: { tools: {}, resources: {} } });

    expect(discoveries).toHaveLength(1);
    const discovery = discoveries[0];
    expect(discovery.sourceId).toBe("mock");
    expect(discovery.resources).toEqual(hoisted.listResourcesResult.resources);
    expect(discovery.prompts).toEqual([hoisted.promptDefinition]);

    const [tool] = discovery.tools;
    expect(tool).toMatchObject({
      name: "mock_search",
      description: "Searches mock data",
      jsonSchema: hoisted.toolSchema,
      outputSchema: hoisted.outputSchema,
    });

    const handler = tool.handler as ToolHandler;
    const result = await handler({ query: "beta" });

    expect(hoisted.Client).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      schema: hoisted.outputSchema.$id,
      content: "results for beta",
      data: { items: ["alpha", "beta"] },
      metadata: { tookMs: 12 },
    });
  });

  it("falls back when tool call validation rejects missing messages", async () => {
    const service = new McpToolSourceService();
    const config: StreamableHttpConfiguredSource = {
      id: "mock",
      type: "mcp",
      url: "https://mcp.example.com/rpc",
    };

    const originalImplementation = hoisted.Client.getMockImplementation();
    const fallbackCallTool = vi
      .fn()
      .mockImplementation(
        async (
          params: { name: string; arguments?: Record<string, unknown> },
          schema?: unknown,
        ) => {
          if (schema) {
            const error = new Error(
              "ZodError: [ { \"path\": [\"messages\"], \"message\": \"Required\" } ]",
            );
            error.name = "ZodError";
            throw error;
          }

          return {
            schema: hoisted.outputSchema.$id,
            content: `results for ${params.arguments?.query}`,
            data: { items: ["alpha", "beta"] },
            metadata: { tookMs: 12 },
          };
        },
      );

    hoisted.Client.mockImplementationOnce(
      (info: unknown, options: unknown) =>
        originalImplementation!(info, options),
    );
    hoisted.Client.mockImplementationOnce((info: unknown, options: unknown) => {
      const instance = originalImplementation!(info, options);
      instance.callTool = fallbackCallTool as unknown as typeof instance.callTool;
      return instance;
    });

    const discoveries = await service.discoverSources([config]);
    const [tool] = discoveries[0].tools;
    const handler = tool.handler as ToolHandler;

    const result = await handler({ query: "beta" });

    expect(result).toEqual({
      schema: hoisted.outputSchema.$id,
      content: "results for beta",
      data: { items: ["alpha", "beta"] },
      metadata: { tookMs: 12 },
    });
    expect(fallbackCallTool).toHaveBeenCalledTimes(2);
    expect(fallbackCallTool.mock.calls[0][1]).toBeDefined();
    expect(fallbackCallTool.mock.calls[1][1]).toBeUndefined();
  });

  it("rejects when a prompt payload omits mandatory fields", async () => {
    const service = new McpToolSourceService();
    const config: StreamableHttpConfiguredSource = {
      id: "invalid-prompts",
      type: "mcp",
      url: "https://mcp.example.com/rpc",
      name: "Invalid prompt server",
    };

    const originalImplementation = hoisted.Client.getMockImplementation();
    hoisted.Client.mockImplementationOnce((info: unknown, options: unknown) => {
      const instance = originalImplementation!(info, options);
      instance.listPrompts = vi
        .fn()
        .mockResolvedValue({ prompts: [{ name: "broken" }] });
      instance.getPrompt = vi
        .fn()
        .mockResolvedValue({ prompt: { description: "missing name" } });
      return instance;
    });

    await expect(service.discoverSources([config])).rejects.toThrowErrorMatchingInlineSnapshot(
      `[Error: MCP prompt invalid-prompts/broken is missing a name]`
    );
  });
});
