import { Injectable } from "@nestjs/common";
import { Buffer } from "buffer";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";
import type {
  MCPToolSourceConfig,
  MCPAuthConfig,
} from "@eddie/config";
import { LoggerService } from "@eddie/io";
import type { Logger } from "pino";
import type {
  DiscoveredMcpResource,
  DiscoveredMcpPrompt,
  McpPromptDefinition,
  McpPromptGetResult,
  McpPromptsListResult,
  McpResourceDescription,
  McpResourcesListResult,
  McpToolDescription,
  McpToolSourceDiscovery,
  McpToolsListResult,
} from "./types";
import type { ToolDefinition, ToolResult, ToolCallArguments } from "@eddie/types";

interface CachedSessionInfo {
  sessionId?: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: Record<string, unknown>;
}

interface ClientContext {
  client: Client;
  transportName: string;
  serverInfo?: Record<string, unknown>;
  serverCapabilities?: Record<string, unknown>;
  serverIdentity: ServerIdentity;
}

interface ServerIdentity {
  serverName?: string;
  serverVersion?: string;
}

interface CallToolResultPayload {
  content?: unknown[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

const DEFAULT_CLIENT_NAME = "eddie";
const DEFAULT_CLIENT_VERSION = "unknown";
const TRANSPORT_NAME = "streamable-http";
const CLIENT_MODULE_PATH =
  "@modelcontextprotocol/sdk/client/index.js" as const;
const STREAMABLE_TRANSPORT_MODULE_PATH =
  "@modelcontextprotocol/sdk/client/streamableHttp.js" as const;

type Client = typeof import("@modelcontextprotocol/sdk/client/index.js").Client;

@Injectable()
export class McpToolSourceService {
  private readonly sessionCache = new Map<string, CachedSessionInfo>();
  private readonly logger: Logger;
  private sdkModulesPromise?: Promise<SdkModules>;

  constructor(private readonly loggerService: LoggerService) {
    this.logger = this.loggerService.getLogger("mcp-tool-source");
  }

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
    return this.withClient(source, async (context) => {
      const toolsResult = await this.executeRequest<McpToolsListResult>(
        source,
        context,
        "tools/list",
        () => context.client.listTools()
      );
      const descriptors = toolsResult.tools ?? [];
      if (typeof context.client.cacheToolOutputSchemas === "function") {
        context.client.cacheToolOutputSchemas(descriptors);
      }

      const toolDefinitions = descriptors.map((tool) =>
        this.toToolDefinition(source, tool)
      );

      const resourcesResult = await this.executeRequest<McpResourcesListResult>(
        source,
        context,
        "resources/list",
        () => context.client.listResources()
      );
      const resources = (resourcesResult.resources ?? []).map((resource) => ({
        ...resource,
        metadata: resource.metadata
          ? structuredClone(resource.metadata)
          : undefined,
      }));

      const prompts = await this.discoverPrompts(source, context);

      return { tools: toolDefinitions, resources, prompts };
    });
  }

  private async discoverPrompts(
    source: MCPToolSourceConfig,
    context: ClientContext
  ): Promise<McpPromptDefinition[]> {
    try {
      const result = await this.executeRequest<McpPromptsListResult>(
        source,
        context,
        "prompts/list",
        () => context.client.listPrompts()
      );
      const descriptors = result.prompts ?? [];
      if (!descriptors.length) {
        return [];
      }

      const prompts = await Promise.all(
        descriptors.map((descriptor) =>
          this.executeRequest<McpPromptGetResult>(source, context, "prompts/get", () =>
            context.client.getPrompt({ name: descriptor.name })
          )
        )
      );

      return prompts.map((response) => this.clonePrompt(response.prompt));
    } catch (error) {
      if (this.isPromptsNotSupportedError(error)) {
        return [];
      }

      throw error;
    }
  }

  private clonePrompt(prompt: McpPromptDefinition): McpPromptDefinition {
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
      handler: async (args: ToolCallArguments) => {
        const result = await this.callTool(source, descriptor.name, args);
        return result;
      },
    };
  }

  private async callTool(
    source: MCPToolSourceConfig,
    name: string,
    args: ToolCallArguments
  ): Promise<ToolResult> {
    return this.withClient(source, async (context) => {
      const params = {
        name,
        arguments: structuredClone(args ?? {}),
      };
      const rawResult = await this.executeRequest<CallToolResultPayload>(
        source,
        context,
        "tools/call",
        () => context.client.callTool(params)
      );

      return this.toToolResult(name, rawResult);
    });
  }

  private toToolResult(name: string, result: CallToolResultPayload): ToolResult {
    if (result.isError) {
      const message = this.flattenContent(result.content ?? []) ??
        `Tool ${name} reported an error.`;
      throw new Error(message);
    }

    const structured = result.structuredContent;
    if (
      structured &&
      typeof structured === "object" &&
      "schema" in structured &&
      typeof (structured as { schema?: unknown }).schema === "string" &&
      "content" in structured &&
      typeof (structured as { content?: unknown }).content === "string"
    ) {
      const toolResult = structured as ToolResult;
      return {
        schema: toolResult.schema,
        content: toolResult.content,
        data:
          toolResult.data !== undefined
            ? structuredClone(toolResult.data)
            : undefined,
        metadata:
          toolResult.metadata !== undefined
            ? structuredClone(toolResult.metadata)
            : undefined,
      };
    }

    const fallbackContent = this.flattenContent(result.content ?? []);
    if (!fallbackContent) {
      throw new Error(
        `Tool ${name} did not return structured content or textual output.`
      );
    }

    return {
      schema: "mcp.tool.result",
      content: fallbackContent,
      metadata:
        result._meta !== undefined
          ? structuredClone(result._meta)
          : undefined,
    };
  }

  private flattenContent(content: unknown[]): string | undefined {
    if (!Array.isArray(content) || content.length === 0) {
      return undefined;
    }

    const parts: string[] = [];
    for (const block of content) {
      if (!block || typeof block !== "object") {
        parts.push(String(block));
        continue;
      }

      const candidate = block as { type?: unknown; text?: unknown };
      if (candidate.type === "text" && typeof candidate.text === "string") {
        parts.push(candidate.text);
        continue;
      }

      parts.push(JSON.stringify(block));
    }

    return parts.join("\n");
  }

  private async withClient<T>(
    source: MCPToolSourceConfig,
    run: (context: ClientContext) => Promise<T>
  ): Promise<T> {
    const { Client, StreamableHTTPClientTransport } = await this.loadSdkModules();
    const cached = this.sessionCache.get(source.id);
    const headers = this.buildHeaders(source);
    const transportUrl = new URL(source.url);
    const transport = new StreamableHTTPClientTransport(transportUrl, {
      requestInit: { headers },
      sessionId: cached?.sessionId,
    });
    const client = new Client(
      { name: DEFAULT_CLIENT_NAME, version: DEFAULT_CLIENT_VERSION },
      { capabilities: source.capabilities ?? {} }
    );

    try {
      await client.connect(transport);
    } catch (error) {
      this.logger.error(
        {
          event: "mcp.initialize",
          sourceId: source.id,
          transport: TRANSPORT_NAME,
          status: "error",
          error: this.normalizeError(error),
        },
        "Failed to connect to MCP server"
      );
      throw error;
    }

    const serverCapabilities =
      (client.getServerCapabilities() as Record<string, unknown> | undefined) ??
      cached?.capabilities;
    const serverInfo =
      (client.getServerVersion() as Record<string, unknown> | undefined) ??
      cached?.serverInfo;
    const identity = this.resolveServerIdentity(serverInfo);

    const shouldLogHandshake = !cached?.capabilities;
    if (shouldLogHandshake) {
      this.logger.info(
        {
          event: "mcp.initialize",
          sourceId: source.id,
          serverName: identity.serverName,
          serverVersion: identity.serverVersion,
          capabilities: serverCapabilities,
          transport: TRANSPORT_NAME,
        },
        "Connected to MCP server"
      );
    }

    this.sessionCache.set(source.id, {
      sessionId: transport.sessionId ?? cached?.sessionId,
      capabilities: serverCapabilities,
      serverInfo,
    });

    try {
      const context: ClientContext = {
        client,
        transportName: TRANSPORT_NAME,
        serverCapabilities,
        serverInfo,
        serverIdentity: identity,
      };
      return await run(context);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private async executeRequest<T>(
    source: MCPToolSourceConfig,
    context: ClientContext,
    method: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await operation();
      const durationMs = performance.now() - startedAt;
      this.logger.info(
        {
          event: "mcp.request",
          sourceId: source.id,
          method,
          transport: context.transportName,
          durationMs,
          status: "ok",
          serverName: context.serverIdentity.serverName,
          serverVersion: context.serverIdentity.serverVersion,
        },
        "MCP request completed"
      );
      return result;
    } catch (error) {
      const durationMs = performance.now() - startedAt;
      this.logger.error(
        {
          event: "mcp.request",
          sourceId: source.id,
          method,
          transport: context.transportName,
          durationMs,
          status: "error",
          serverName: context.serverIdentity.serverName,
          serverVersion: context.serverIdentity.serverVersion,
          error: this.normalizeError(error),
        },
        "MCP request failed"
      );
      throw error;
    }
  }

  private resolveServerIdentity(info?: Record<string, unknown>): ServerIdentity {
    if (!info || typeof info !== "object") {
      return {};
    }

    const candidate = info as { name?: unknown; version?: unknown };
    const serverName = typeof candidate.name === "string" ? candidate.name : undefined;
    const serverVersion =
      typeof candidate.version === "string" ? candidate.version : undefined;

    return { serverName, serverVersion };
  }

  private normalizeError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      const payload: Record<string, unknown> = {
        message: error.message,
      };
      if (error.stack) {
        payload.stack = error.stack;
      }
      const code = (error as { code?: unknown }).code;
      if (code !== undefined) {
        payload.code = code;
      }
      return payload;
    }

    return { message: String(error) };
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

  private isPromptsNotSupportedError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    if (message.includes("method not found")) {
      return true;
    }

    const code = (error as { code?: unknown }).code;
    if (typeof code === "number" && code === -32601) {
      return true;
    }
    if (typeof code === "string" && code.toLowerCase() === "methodnotfound") {
      return true;
    }

    const cause = (error as { cause?: unknown }).cause;
    if (cause && typeof cause === "object" && "code" in cause) {
      const causeCode = (cause as { code?: unknown }).code;
      if (typeof causeCode === "number" && causeCode === -32601) {
        return true;
      }
      if (
        typeof causeCode === "string" &&
        causeCode.toLowerCase() === "methodnotfound"
      ) {
        return true;
      }
    }

    return false;
  }

  private async loadSdkModules(): Promise<SdkModules> {
    if (!this.sdkModulesPromise) {
      this.sdkModulesPromise = this.importSdkModules();
    }

    try {
      return await this.sdkModulesPromise;
    } catch (error) {
      this.sdkModulesPromise = undefined;
      throw error;
    }
  }

  private async importSdkModules(): Promise<SdkModules> {
    const [clientModule, transportModule] = await Promise.all([
      import(CLIENT_MODULE_PATH),
      import(STREAMABLE_TRANSPORT_MODULE_PATH),
    ]);

    return {
      Client: clientModule.Client,
      StreamableHTTPClientTransport:
        transportModule.StreamableHTTPClientTransport,
    };
  }
}

type SdkModules = {
  Client: Client;
  StreamableHTTPClientTransport: typeof import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  ).StreamableHTTPClientTransport;
};
