import { Injectable } from "@nestjs/common";
import { Buffer } from "buffer";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ErrorCode,
  McpError,
  ResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  MCPAuthConfig,
  MCPToolSourceConfig,
  MCPTransportConfig,
} from "@eddie/config";
import type {
  DiscoveredMcpPrompt,
  DiscoveredMcpResource,
  McpPromptDefinition,
  McpResourceDescription,
  McpToolSourceDiscovery,
} from "./types";
import type { ToolCallArguments, ToolDefinition, ToolResult } from "@eddie/types";

const CLIENT_INFO = { name: "eddie", version: "unknown" } as const;

@Injectable()
export class McpToolSourceService {
  async collectTools(
    sources: MCPToolSourceConfig[] | undefined
  ): Promise<{
    tools: ToolDefinition[];
    resources: DiscoveredMcpResource[];
    prompts: DiscoveredMcpPrompt[];
  }> {
    const discoveries = await this.discoverSources(sources);
    const tools = discoveries.flatMap((entry) => entry.tools);
    const resources = discoveries.flatMap((entry) =>
      entry.resources.map((resource) => ({
        ...resource,
        sourceId: entry.sourceId,
      }))
    );
    const prompts = discoveries.flatMap((entry) =>
      entry.prompts.map((prompt) => ({
        ...prompt,
        sourceId: entry.sourceId,
      }))
    );

    return { tools, resources, prompts };
  }

  async discoverSources(
    sources: MCPToolSourceConfig[] | undefined
  ): Promise<McpToolSourceDiscovery[]> {
    if (!sources?.length) {
      return [];
    }

    const discoveries: McpToolSourceDiscovery[] = [];
    for (const source of sources) {
      const discovery = await this.discoverSource(source);
      discoveries.push({
        sourceId: source.id,
        tools: discovery.tools,
        resources: discovery.resources,
        prompts: discovery.prompts,
      });
    }

    return discoveries;
  }

  private async discoverSource(source: MCPToolSourceConfig): Promise<{
    tools: ToolDefinition[];
    resources: McpResourceDescription[];
    prompts: McpPromptDefinition[];
  }> {
    return this.withClient(source, async (client) => {
      const toolsResult = await client.listTools();
      const resourcesResult = await client.listResources();
      const prompts = await this.discoverPrompts(client);

      const toolDefinitions = (toolsResult.tools ?? []).map((tool) =>
        this.toToolDefinition(source, {
          name: tool.name,
          description: tool.description,
          inputSchema: structuredClone(tool.inputSchema ?? {}),
          outputSchema: tool.outputSchema
            ? structuredClone(tool.outputSchema)
            : undefined,
        })
      );

      const resources = (resourcesResult.resources ?? []).map((resource) => ({
        ...resource,
        metadata: resource.metadata
          ? structuredClone(resource.metadata)
          : undefined,
      }));

      return { tools: toolDefinitions, resources, prompts };
    });
  }

  private async discoverPrompts(
    client: Client
  ): Promise<McpPromptDefinition[]> {
    try {
      const listResult = await client.listPrompts();
      const descriptors = listResult.prompts ?? [];
      if (!descriptors.length) {
        return [];
      }

      const definitions = await Promise.all(
        descriptors.map(async (descriptor) => {
          const result = await client.getPrompt({ name: descriptor.name });
          const prompt = result.prompt;
          return {
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments?.map((argument) => ({
              ...argument,
              schema:
                argument.schema !== undefined
                  ? structuredClone(argument.schema)
                  : undefined,
            })),
            messages: (prompt.messages ?? []).map((message) => ({
              ...message,
              content: structuredClone(message.content ?? []),
            })),
          } satisfies McpPromptDefinition;
        })
      );

      return definitions;
    } catch (error) {
      if (this.isPromptsNotSupportedError(error)) {
        return [];
      }

      throw error;
    }
  }

  private toToolDefinition(
    source: MCPToolSourceConfig,
    descriptor: {
      name: string;
      description?: string;
      inputSchema: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
    }
  ): ToolDefinition {
    const jsonSchema = structuredClone(descriptor.inputSchema);
    const outputSchema = descriptor.outputSchema
      ? structuredClone(descriptor.outputSchema)
      : undefined;

    return {
      name: descriptor.name,
      description: descriptor.description,
      jsonSchema,
      ...(outputSchema ? { outputSchema } : {}),
      handler: async (args: ToolCallArguments) =>
        this.executeTool(source, descriptor.name, args),
    };
  }

  private async executeTool(
    source: MCPToolSourceConfig,
    toolName: string,
    args: ToolCallArguments
  ): Promise<ToolResult> {
    return this.withClient(source, async (client) => {
      const result = await client.callTool(
        {
          name: toolName,
          arguments: structuredClone(args ?? {}),
        },
        ResultSchema
      );

      if (
        !result ||
        typeof result !== "object" ||
        typeof (result as { schema?: unknown }).schema !== "string" ||
        typeof (result as { content?: unknown }).content !== "string"
      ) {
        throw new Error(
          `Tool ${toolName} returned an invalid result payload from MCP source ${source.id}.`
        );
      }

      const typedResult = result as {
        schema: string;
        content: string;
        data?: unknown;
        metadata?: unknown;
      };

      const toolResult: ToolResult = {
        schema: typedResult.schema,
        content: typedResult.content,
        data:
          typedResult.data !== undefined
            ? structuredClone(typedResult.data)
            : undefined,
        metadata:
          typedResult.metadata !== undefined
            ? structuredClone(typedResult.metadata)
            : undefined,
      };

      return toolResult;
    });
  }

  private async withClient<T>(
    source: MCPToolSourceConfig,
    callback: (client: Client) => Promise<T>
  ): Promise<T> {
    const transport = this.createTransport(source);
    const client = this.createClient(source);

    try {
      await client.connect(transport);
      return await callback(client);
    } finally {
      try {
        await client.close();
      } catch {
        // ignore shutdown errors
      }

      if (typeof (transport as { close?: () => Promise<void> }).close === "function") {
        try {
          await (transport as { close: () => Promise<void> }).close();
        } catch {
          // ignore shutdown errors
        }
      }
    }
  }

  private createClient(source: MCPToolSourceConfig): Client {
    const options = source.capabilities
      ? { capabilities: structuredClone(source.capabilities) }
      : undefined;
    return new Client(CLIENT_INFO, options);
  }

  private createTransport(source: MCPToolSourceConfig): Transport {
    const transportConfig = this.resolveTransportConfig(source);
    switch (transportConfig.type) {
      case "streamable-http": {
        const headers = this.buildHttpHeaders(source, transportConfig.headers);
        return new StreamableHTTPClientTransport(new URL(transportConfig.url), {
          requestInit: { headers },
        });
      }
      case "sse": {
        const headers = this.buildHttpHeaders(source, transportConfig.headers);
        return new SSEClientTransport(new URL(transportConfig.url), {
          eventSourceInit: { headers },
          requestInit: { headers },
        });
      }
      case "websocket":
        return new WebSocketClientTransport(new URL(transportConfig.url));
      case "stdio":
        return new StdioClientTransport({
          command: transportConfig.command,
          args: transportConfig.args,
          env: transportConfig.env,
          cwd: transportConfig.cwd,
          stderr: transportConfig.stderr,
        });
      default: {
        const exhaustiveCheck: never = transportConfig;
        throw new Error(
          `Unsupported MCP transport type ${(exhaustiveCheck as { type: string }).type}`
        );
      }
    }
  }

  private resolveTransportConfig(
    source: MCPToolSourceConfig
  ): MCPTransportConfig {
    if (source.transport) {
      return source.transport;
    }

    if (!source.url) {
      throw new Error(
        `MCP source ${source.id} must provide either a url or a transport configuration.`
      );
    }

    return { type: "streamable-http", url: source.url };
  }

  private buildHttpHeaders(
    source: MCPToolSourceConfig,
    transportHeaders?: Record<string, string>
  ): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      ...(source.headers ?? {}),
      ...(transportHeaders ?? {}),
    };

    const hasAuthorizationHeader = Object.keys(headers).some(
      (key) => key.toLowerCase() === "authorization"
    );

    if (!hasAuthorizationHeader && source.auth) {
      const authorization = this.computeAuthorization(source.auth);
      if (authorization) {
        headers.Authorization = authorization;
      }
    }

    return headers;
  }

  private computeAuthorization(auth: MCPAuthConfig): string | undefined {
    switch (auth.type) {
      case "basic": {
        const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString(
          "base64"
        );
        return `Basic ${encoded}`;
      }
      case "bearer":
        return `Bearer ${auth.token}`;
      case "none":
      default:
        return undefined;
    }
  }

  private isPromptsNotSupportedError(error: unknown): boolean {
    if (error instanceof McpError) {
      return error.code === ErrorCode.MethodNotFound;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes("method not found") ||
        message.includes("does not support prompts")
      );
    }

    return false;
  }
}
