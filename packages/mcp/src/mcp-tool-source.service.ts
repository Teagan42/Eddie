import { Injectable } from "@nestjs/common";
import { Buffer } from "buffer";
import type {
  MCPToolSourceConfig,
  MCPAuthConfig,
  MCPStreamableHttpReconnectionConfig,
} from "@eddie/config";
import type {
  DiscoveredMcpResource,
  DiscoveredMcpPrompt,
  McpPromptDefinition,
  McpPromptDescription,
  McpPromptMessage,
  McpPromptArgument,
  McpResourceDescription,
  McpToolDescription,
  McpToolSourceDiscovery,
} from "./types";
import type { ToolDefinition, ToolResult, ToolCallArguments } from "@eddie/types";
import { Client } from "@modelcontextprotocol/sdk/client";
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
  type StreamableHTTPReconnectionOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp";
import {
  SSEClientTransport,
  type SSEClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/sse";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import {
  CompatibilityCallToolResultSchema,
  ErrorCode,
  McpError,
  type CallToolResult,
  type ClientCapabilities,
  type CompatibilityCallToolResult,
} from "@modelcontextprotocol/sdk/types";

type CallToolResultLike = CallToolResult | CompatibilityCallToolResult;

type ClientExecutor<T> = (client: Client) => Promise<T>;

const STREAMABLE_HTTP_DEFAULT_RECONNECTION: StreamableHTTPReconnectionOptions = {
  maxReconnectionDelay: 30000,
  initialReconnectionDelay: 1000,
  reconnectionDelayGrowFactor: 1.5,
  maxRetries: 2,
};

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
      const tools = await this.listTools(client);
      const resources = await this.listResources(client);
      const promptDefinitions = await this.discoverPrompts(client);

      const toolDefinitions = tools.map((tool) =>
        this.toToolDefinition(source, tool)
      );

      return { tools: toolDefinitions, resources, prompts: promptDefinitions };
    });
  }

  private async listTools(client: Client): Promise<McpToolDescription[]> {
    const result = await client.listTools();
    const tools = (result.tools ?? []) as McpToolDescription[];
    return tools.map((tool) => ({
      ...tool,
      inputSchema: structuredClone(tool.inputSchema),
      outputSchema: tool.outputSchema
        ? structuredClone(tool.outputSchema)
        : undefined,
    }));
  }

  private async listResources(client: Client): Promise<McpResourceDescription[]> {
    const result = await client.listResources();
    const resources = (result.resources ?? []) as McpResourceDescription[];
    return resources.map((resource) => ({
      ...resource,
      metadata: resource.metadata ? structuredClone(resource.metadata) : undefined,
    }));
  }

  private async discoverPrompts(client: Client): Promise<McpPromptDefinition[]> {
    try {
      const descriptors = await this.listPrompts(client);
      if (!descriptors.length) {
        return [];
      }

      return Promise.all(
        descriptors.map((descriptor) => this.getPrompt(client, descriptor.name))
      );
    } catch (error) {
      if (this.isPromptsNotSupportedError(error)) {
        return [];
      }

      throw error;
    }
  }

  private async listPrompts(client: Client): Promise<McpPromptDescription[]> {
    const result = await client.listPrompts();
    return result.prompts ?? [];
  }

  private async getPrompt(
    client: Client,
    name: string
  ): Promise<McpPromptDefinition> {
    const result = await client.getPrompt({ name });
    const prompt = result.prompt as McpPromptDefinition;
    const promptArguments = (prompt.arguments ?? []) as McpPromptArgument[];
    const promptMessages = (prompt.messages ?? []) as McpPromptMessage[];
    return {
      name: prompt.name,
      description: prompt.description,
      arguments: promptArguments.map((argument) => ({
        ...argument,
        schema:
          argument.schema !== undefined
            ? structuredClone(argument.schema)
            : undefined,
      })),
      messages: promptMessages.map((message) => ({
        ...message,
        content: structuredClone(message.content ?? []),
      })),
    };
  }

  private toToolDefinition(
    source: MCPToolSourceConfig,
    descriptor: McpToolDescription
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
        this.withClient(source, async (client) => {
          const result = await client.callTool(
            {
              name: descriptor.name,
              arguments: structuredClone(args ?? {}),
            },
            CompatibilityCallToolResultSchema
          );

          return this.normalizeToolResult(descriptor, result);
        }),
    };
  }

  private normalizeToolResult(
    descriptor: McpToolDescription,
    result: CallToolResultLike
  ): ToolResult {
    const direct = this.extractStructuredToolResult(result);
    if (direct) {
      return direct;
    }

    if ("toolResult" in result) {
      const compat = this.extractStructuredToolResult(result.toolResult);
      if (compat) {
        return compat;
      }
    }

    if ("structuredContent" in result) {
      const structured = this.extractStructuredToolResult(
        result.structuredContent
      );
      if (structured) {
        return structured;
      }
    }

    const schema = this.resolveSchemaId(descriptor, result);
    let data: unknown;
    if ("structuredContent" in result && result.structuredContent !== undefined) {
      data = structuredClone(result.structuredContent);
      if (
        data &&
        typeof data === "object" &&
        "schema" in (data as Record<string, unknown>) &&
        typeof (data as Record<string, unknown>).schema === "string"
      ) {
        delete (data as Record<string, unknown>).schema;
      }
    }

    const content = this.stringifyContentBlocks(
      "content" in result ? result.content : undefined
    );

    const normalized: ToolResult = {
      schema,
      content,
    };

    if (typeof data !== "undefined") {
      normalized.data = data;
    }

    return normalized;
  }

  private extractStructuredToolResult(payload: unknown): ToolResult | undefined {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const schema = (payload as { schema?: unknown }).schema;
    const content = (payload as { content?: unknown }).content;

    if (typeof schema !== "string" || typeof content !== "string") {
      return undefined;
    }

    const normalized: ToolResult = {
      schema,
      content,
    };

    if ("data" in (payload as Record<string, unknown>)) {
      const data = (payload as { data?: unknown }).data;
      if (data !== undefined) {
        normalized.data = structuredClone(data);
      }
    }

    if ("metadata" in (payload as Record<string, unknown>)) {
      const metadata = (payload as { metadata?: unknown }).metadata;
      if (this.isRecord(metadata)) {
        normalized.metadata = structuredClone(metadata);
      }
    }

    return normalized;
  }

  private resolveSchemaId(
    descriptor: McpToolDescription,
    result: CallToolResultLike
  ): string {
    if (
      "structuredContent" in result &&
      result.structuredContent &&
      typeof result.structuredContent === "object" &&
      "schema" in result.structuredContent &&
      typeof (result.structuredContent as { schema?: unknown }).schema ===
        "string"
    ) {
      return (result.structuredContent as { schema: string }).schema;
    }

    const outputSchema = descriptor.outputSchema;
    if (
      outputSchema &&
      typeof outputSchema === "object" &&
      "$id" in outputSchema &&
      typeof (outputSchema as { $id?: unknown }).$id === "string"
    ) {
      return (outputSchema as { $id: string }).$id;
    }

    return `mcp.tool.${descriptor.name}.result`;
  }

  private stringifyContentBlocks(content: unknown): string {
    if (!Array.isArray(content)) {
      if (typeof content === "string") {
        return content;
      }

      if (typeof content === "undefined") {
        return "";
      }

      return JSON.stringify(content);
    }

    if (content.length === 0) {
      return "";
    }

    const segments = content.map((segment) => {
      if (segment && typeof segment === "object" && "type" in segment) {
        const type = (segment as { type?: unknown }).type;
        if (type === "text") {
          const text = (segment as { text?: unknown }).text;
          if (typeof text === "string") {
            return text;
          }
        }

        return JSON.stringify(segment);
      }

      if (typeof segment === "string") {
        return segment;
      }

      return JSON.stringify(segment);
    });

    return segments.join("\n");
  }

  private async withClient<T>(
    source: MCPToolSourceConfig,
    executor: ClientExecutor<T>
  ): Promise<T> {
    const transport = this.createTransport(source);
    const client = this.createClient(source);

    try {
      await client.connect(transport);
      return await executor(client);
    } finally {
      await Promise.allSettled([
        client.close(),
        transport.close(),
      ]);
    }
  }

  private createClient(source: MCPToolSourceConfig): Client {
    const capabilities = source.capabilities
      ? (structuredClone(source.capabilities) as ClientCapabilities)
      : undefined;

    return new Client(
      {
        name: source.name ?? "eddie",
        version: "unknown",
      },
      capabilities ? { capabilities } : undefined
    );
  }

  private createTransport(source: MCPToolSourceConfig): Transport {
    const url = new URL(source.url);
    const headers = this.buildHeaders(source);
    const transportConfig = source.transport;

    if (transportConfig?.type === "sse") {
      const options: SSEClientTransportOptions = {
        requestInit: { headers },
      };
      return new SSEClientTransport(url, options);
    }

    const options: StreamableHTTPClientTransportOptions = {
      requestInit: { headers },
    };

    if (transportConfig?.type === "streamable-http") {
      if (transportConfig.sessionId) {
        options.sessionId = transportConfig.sessionId;
      }

      const reconnectionOptions = this.buildReconnectionOptions(
        transportConfig.reconnection
      );
      if (reconnectionOptions) {
        options.reconnectionOptions = reconnectionOptions;
      }
    }

    return new StreamableHTTPClientTransport(url, options);
  }

  private buildReconnectionOptions(
    overrides: MCPStreamableHttpReconnectionConfig | undefined
  ): StreamableHTTPReconnectionOptions | undefined {
    if (!overrides) {
      return undefined;
    }

    return {
      maxReconnectionDelay:
        overrides.maxReconnectionDelay ??
        STREAMABLE_HTTP_DEFAULT_RECONNECTION.maxReconnectionDelay,
      initialReconnectionDelay:
        overrides.initialReconnectionDelay ??
        STREAMABLE_HTTP_DEFAULT_RECONNECTION.initialReconnectionDelay,
      reconnectionDelayGrowFactor:
        overrides.reconnectionDelayGrowFactor ??
        STREAMABLE_HTTP_DEFAULT_RECONNECTION.reconnectionDelayGrowFactor,
      maxRetries:
        overrides.maxRetries ?? STREAMABLE_HTTP_DEFAULT_RECONNECTION.maxRetries,
    };
  }

  private buildHeaders(source: MCPToolSourceConfig): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
      ...(source.headers ?? {}),
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

  private computeAuthorization(auth: MCPAuthConfig): string {
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
        return "";
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private isPromptsNotSupportedError(error: unknown): boolean {
    if (error instanceof McpError) {
      return error.code === ErrorCode.MethodNotFound;
    }

    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    if (message.includes("method not found")) {
      return true;
    }

    const cause = (error as { cause?: unknown }).cause;
    if (cause && typeof cause === "object" && "code" in cause) {
      const code = (cause as { code?: unknown }).code;
      if (typeof code === "number" && code === -32601) {
        return true;
      }
    }

    return false;
  }
}
