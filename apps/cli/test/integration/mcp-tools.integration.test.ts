import "reflect-metadata";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import * as http from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { McpToolSourceService } from "@eddie/mcp";
import { ToolRegistryFactory } from "@eddie/tools";
import type { MCPToolSourceConfig } from "@eddie/config";

interface RecordedRequest {
  method: string;
  params?: Record<string, unknown>;
  headers: http.IncomingHttpHeaders;
}

describe("MCP tool source integration", () => {
  const requests: RecordedRequest[] = [];
  const expectedToken = "mock-token";
  const handshakeMethods = ["initialize", "notifications/initialized"] as const;
  const toolSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  };
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
  };
  const promptArguments = [
    {
      name: "topic",
      description: "Topic to explore",
      required: true,
      schema: { type: "string" },
    },
  ];
  const promptMessages = [
    {
      role: "assistant",
      content: {
        type: "text",
        text: "You are a helpful assistant for mock data.",
      },
    },
  ];

  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end();
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }

      const rawBody = Buffer.concat(chunks).toString("utf-8");
      const message = rawBody.length > 0 ? JSON.parse(rawBody) : {};

      requests.push({
        method: message.method,
        params: message.params,
        headers: req.headers,
      });

      if (req.headers.authorization !== `Bearer ${expectedToken}`) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id ?? null,
            error: { code: -32001, message: "unauthorized" },
          })
        );
        return;
      }

      let responsePayload: unknown;
      switch (message.method) {
        case "initialize":
          responsePayload = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              sessionId: "mock-session",
              protocolVersion: "2024-11-05",
              capabilities: { tools: {}, resources: {} },
              serverInfo: { name: "mock-mcp", version: "2.0.0" },
            },
          };
          break;
        case "tools/list":
          responsePayload = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              tools: [
                {
                  name: "mock_search",
                  description: "Searches mock data",
                  inputSchema: toolSchema,
                  outputSchema,
                },
              ],
            },
          };
          break;
        case "resources/list":
          responsePayload = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              resources: [
                {
                  name: "mock-docs",
                  uri: "https://example.com/docs",
                  description: "Mock documentation",
                  mimeType: "text/plain",
                  metadata: { version: "1.0.0" },
                },
              ],
            },
          };
          break;
        case "prompts/list":
          responsePayload = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              prompts: [
                {
                  name: "mock_prompt",
                  description: "Provides a mock prompt",
                  arguments: promptArguments,
                  messages: promptMessages,
                },
              ],
            },
          };
          break;
        case "prompts/get":
          responsePayload = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              prompt: {
                name: message.params?.name ?? "mock_prompt",
                description: "Provides a mock prompt",
                arguments: promptArguments,
                messages: promptMessages,
              },
              messages: promptMessages,
            },
          };
          break;
        case "tools/call":
          responsePayload = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [
                {
                  type: "text",
                  text: `results for ${message.params?.arguments?.query}`,
                },
              ],
              structuredContent: {
                schema: outputSchema.$id,
                content: `results for ${message.params?.arguments?.query}`,
                data: { items: ["alpha", "beta"] },
                metadata: { tookMs: 12 },
              },
            },
          };
          break;
        default:
          responsePayload = {
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: `Unknown method ${message.method}` },
          };
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(responsePayload));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind mock MCP server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it("discovers tools and executes MCP-backed handlers", async () => {
    requests.length = 0;
    const service = new McpToolSourceService();
    const config: MCPToolSourceConfig = {
      id: "mock",
      type: "mcp",
      url: `${baseUrl}/rpc`,
      auth: { type: "bearer", token: expectedToken },
      capabilities: { tools: {}, resources: {} },
    };

    const discoveries = await service.discoverSources([config]);
    expect(discoveries).toHaveLength(1);
    const discovery = discoveries[0];
    expect(discovery.sourceId).toBe("mock");
    expect(discovery.tools).toHaveLength(1);
    expect(discovery.resources).toEqual([
      {
        name: "mock-docs",
        uri: "https://example.com/docs",
        description: "Mock documentation",
        mimeType: "text/plain",
        metadata: { version: "1.0.0" },
      },
    ]);
    expect(discovery.prompts).toEqual([
      {
        name: "mock_prompt",
        description: "Provides a mock prompt",
        arguments: promptArguments,
        messages: promptMessages,
      },
    ]);

    const methods = requests.map((req) => req.method);
    expect(methods).toEqual([
      ...handshakeMethods,
      "tools/list",
      "resources/list",
      "prompts/list",
      "prompts/get",
    ]);
    expect(requests[0].headers.authorization).toBe(`Bearer ${expectedToken}`);
    const promptRequestIndex = handshakeMethods.length + 3;
    expect(requests[promptRequestIndex].params?.name).toBe("mock_prompt");

    const cache = (
      service as unknown as {
        sessionCache: Map<
          string,
          { serverInfo?: Record<string, unknown> }
        >;
      }
    ).sessionCache;
    expect(cache.get("mock")?.serverInfo).toEqual({
      name: "mock-mcp",
      version: "2.0.0",
    });

    const registry = new ToolRegistryFactory().create(discovery.tools);
    const result = await registry.execute(
      { name: "mock_search", arguments: { query: "beta" } },
      {
        cwd: process.cwd(),
        confirm: async () => true,
        env: process.env,
      }
    );

    expect(requests.map((req) => req.method)).toEqual([
      ...handshakeMethods,
      "tools/list",
      "resources/list",
      "prompts/list",
      "prompts/get",
      ...handshakeMethods,
      "tools/call",
    ]);
    const toolCallIndex = handshakeMethods.length * 2 + 4;
    expect(requests[toolCallIndex].params?.arguments).toEqual({ query: "beta" });

    expect(result).toEqual({
      schema: outputSchema.$id,
      content: "results for beta",
      data: { items: ["alpha", "beta"] },
      metadata: { tookMs: 12 },
    });
  });
});
