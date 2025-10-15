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
import type {
  ToolDefinition,
  ToolResult,
  ToolCallArguments,
} from "@eddie/types";
import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types";

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

const DEFAULT_CLIENT_NAME = "eddie";
const DEFAULT_CLIENT_VERSION = "unknown";
const STREAMABLE_TRANSPORT_NAME = "streamable-http" as const;
const SSE_TRANSPORT_NAME = "sse" as const;
const CLIENT_MODULE_PATH =
  "@modelcontextprotocol/sdk/client/index.js" as const;
const STREAMABLE_TRANSPORT_MODULE_PATH =
  "@modelcontextprotocol/sdk/client/streamableHttp.js" as const;
const SSE_TRANSPORT_MODULE_PATH =
  "@modelcontextprotocol/sdk/client/sse.js" as const;
const LOGGER_SCOPE = "mcp-tool-source" as const;

type Client = typeof import("@modelcontextprotocol/sdk/client/index.js").Client;
type TransportName =
  | typeof STREAMABLE_TRANSPORT_NAME
  | typeof SSE_TRANSPORT_NAME;

type ResultEnvelope<T> = { result?: T };
type ToolResultPayload = {
  schema: string;
  content: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class McpToolSourceService {
  private readonly sessionCache = new Map<string, CachedSessionInfo>();
  private readonly logger: Logger;
  private readonly loggerService: LoggerService;
  private sdkModulesPromise?: Promise<SdkModules>;

  constructor(loggerService?: LoggerService) {
    this.loggerService = this.resolveLoggerService(loggerService);
    this.logger = this.loggerService.getLogger(LOGGER_SCOPE);
  }

  private resolveLoggerService(loggerService?: LoggerService): LoggerService {
    if (loggerService) {
      return loggerService;
    }

    return new LoggerService();
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

    const discoveryPromises = sources.map(async (source) => {
      const discovery = await this.discoverSource(source);
      return {
        sourceId: source.id,
        tools: discovery.tools,
        resources: discovery.resources,
        prompts: discovery.prompts,
      } satisfies McpToolSourceDiscovery;
    });

    return Promise.all(discoveryPromises);
  }

  private async discoverSource(source: MCPToolSourceConfig): Promise<{
    tools: ToolDefinition[];
    resources: McpResourceDescription[];
    prompts: McpPromptDefinition[];
  }> {
    return this.withClient(source, async (context) => {
      const toolDescriptors = await this.listToolDescriptorsIfSupported(
        source,
        context
      );

      if (
        toolDescriptors.length > 0 &&
        typeof context.client.cacheToolOutputSchemas === "function"
      ) {
        context.client.cacheToolOutputSchemas(toolDescriptors);
      }

      const toolDefinitions = toolDescriptors.map((tool) =>
        this.toToolDefinition(source, tool)
      );

      const resources = (
        await this.listResourceDescriptorsIfSupported(source, context)
      ).map((resource) => ({
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
    const canListPrompts = this.supportsCapability(
      context.serverCapabilities,
      "prompts",
      "list"
    );
    const canGetPrompts = this.supportsCapability(
      context.serverCapabilities,
      "prompts",
      "get"
    );

    if (!canListPrompts || !canGetPrompts) {
      return [];
    }
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
      if (!this.supportsCapability(context.serverCapabilities, "tools", "call")) {
        throw new Error(
          `MCP server does not advertise tool.call capability for tool ${name}.`
        );
      }

      const params = {
        name,
        arguments: structuredClone(args ?? {}),
      };
      const rawResult = await this.executeRequest<CallToolResult>(
        source,
        context,
        "tools/call",
        () => context.client.callTool(params)
      );

      return this.toToolResult(name, rawResult);
    });
  }

  private toToolResult(name: string, result: CallToolResult): ToolResult {
    if (result.isError) {
      const message = this.flattenContent(result.content ?? []) ??
        `Tool ${name} reported an error.`;
      throw new Error(message);
    }

    const structured = result.structuredContent;
    if (this.isToolResultPayload(structured)) {
      return {
        schema: structured.schema,
        content: structured.content,
        data:
          structured.data !== undefined
            ? structuredClone(structured.data)
            : undefined,
        metadata:
          structured.metadata !== undefined
            ? structuredClone(structured.metadata)
            : undefined,
      };
    }

    const fallbackContent = this.flattenContent(result.content);
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

  private flattenContent(content: ContentBlock[] | undefined): string | undefined {
    if (!content || content.length === 0) {
      return undefined;
    }

    const parts: string[] = [];
    for (const block of content) {
      if (block.type === "text") {
        parts.push(block.text);
        continue;
      }

      parts.push(JSON.stringify(block));
    }

    return parts.join("\n");
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private isToolResultPayload(value: unknown): value is ToolResultPayload {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as {
      schema?: unknown;
      content?: unknown;
      metadata?: unknown;
    };

    if (typeof candidate.schema !== "string" || typeof candidate.content !== "string") {
      return false;
    }

    if (candidate.metadata !== undefined && !this.isRecord(candidate.metadata)) {
      return false;
    }

    return true;
  }


  private async withClient<T>(
    source: MCPToolSourceConfig,
    run: (context: ClientContext) => Promise<T>
  ): Promise<T> {
    const {
      Client,
      StreamableHTTPClientTransport,
      SSEClientTransport,
    } = await this.loadSdkModules();
    const cached = this.sessionCache.get(source.id);
    const headers = this.buildHeaders(source);
    const transportUrl = new URL(source.url);
    const transportName = this.resolveTransportName(source);
    const transport = this.createTransport({
      transportName,
      StreamableHTTPClientTransport,
      SSEClientTransport,
      transportUrl,
      headers,
      cachedSessionId: cached?.sessionId,
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
          transport: transportName,
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
    const serverInfo = this.resolveServerInfo(client, cached?.serverInfo);
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
          transport: transportName,
        },
        "Connected to MCP server"
      );
    }

    const sessionId = this.resolveSessionId({
      transportName,
      transport,
      cachedSessionId: cached?.sessionId,
    });

    this.sessionCache.set(source.id, {
      sessionId,
      capabilities: serverCapabilities,
      serverInfo,
    });

    try {
      const context: ClientContext = {
        client,
        transportName,
        serverCapabilities,
        serverInfo,
        serverIdentity: identity,
      };
      return await run(context);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private normalizeServerInfo(
    info: unknown
  ): Record<string, unknown> | undefined {
    if (!info) {
      return undefined;
    }

    if (typeof info === "string") {
      return { version: info };
    }

    if (typeof info === "object") {
      return info as Record<string, unknown>;
    }

    return undefined;
  }

  private resolveServerInfo(
    client: Client,
    cached?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    const info =
      typeof (client as { getServerInfo?: unknown }).getServerInfo === "function"
        ? (client as unknown as {
            getServerInfo: () => unknown;
          }).getServerInfo()
        : undefined;
    const version =
      typeof client.getServerVersion === "function"
        ? client.getServerVersion()
        : undefined;

    return (
      this.normalizeServerInfo(info) ??
      this.normalizeServerInfo(version) ??
      cached
    );
  }

  private async executeRequest<T>(
    source: MCPToolSourceConfig,
    context: ClientContext,
    method: string,
    operation: () => Promise<T | ResultEnvelope<T>>
  ): Promise<T> {
    const startedAt = performance.now();
    try {
      const rawResult = await operation();
      const result = this.unwrapResult(rawResult);
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

  private unwrapResult<T>(payload: T | ResultEnvelope<T>): T {
    if (
      payload &&
      typeof payload === "object" &&
      Object.prototype.hasOwnProperty.call(payload, "result")
    ) {
      const candidate = payload as ResultEnvelope<T>;
      if (candidate.result !== undefined) {
        return candidate.result;
      }
    }

    return payload as T;
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
    const [clientModule, streamableTransportModule, sseTransportModule] =
      await Promise.all([
        import(CLIENT_MODULE_PATH),
        import(STREAMABLE_TRANSPORT_MODULE_PATH),
        import(SSE_TRANSPORT_MODULE_PATH),
      ]);

    return {
      Client: clientModule.Client,
      StreamableHTTPClientTransport:
        streamableTransportModule.StreamableHTTPClientTransport,
      SSEClientTransport: sseTransportModule.SSEClientTransport,
    };
  }

  private resolveTransportName(source: MCPToolSourceConfig): TransportName {
    if (source.transport === SSE_TRANSPORT_NAME) {
      return SSE_TRANSPORT_NAME;
    }

    return STREAMABLE_TRANSPORT_NAME;
  }

  private createTransport({
    transportName,
    StreamableHTTPClientTransport,
    SSEClientTransport,
    transportUrl,
    headers,
    cachedSessionId,
  }: {
    transportName: TransportName;
    StreamableHTTPClientTransport: SdkModules["StreamableHTTPClientTransport"];
    SSEClientTransport: SdkModules["SSEClientTransport"];
    transportUrl: URL;
    headers: Record<string, string>;
    cachedSessionId?: string;
  }): TransportInstance {
    const requestInit = { headers };

    if (transportName === SSE_TRANSPORT_NAME) {
      return new SSEClientTransport(transportUrl, {
        requestInit,
      });
    }

    return new StreamableHTTPClientTransport(transportUrl, {
      requestInit,
      sessionId: cachedSessionId,
    });
  }
  
  private resolveSessionId({
    transportName,
    transport,
    cachedSessionId,
  }: {
    transportName: TransportName;
    transport: TransportInstance;
    cachedSessionId?: string;
  }): string | undefined {
    if (transportName === STREAMABLE_TRANSPORT_NAME) {
      const streamableTransport =
        transport as StreamableHTTPClientTransportInstance & {
          sessionId?: string;
        };

      return streamableTransport.sessionId ?? cachedSessionId;
    }

    return undefined;
  }

  private supportsCapability(
    capabilities: Record<string, unknown> | undefined,
    capability: string,
    operation?: string
  ): boolean {
    if (!capabilities || typeof capabilities !== "object") {
      return false;
    }

    const value = (capabilities as Record<string, unknown>)[capability];
    if (!value) {
      return false;
    }

    if (!operation) {
      return Boolean(value);
    }

    if (typeof value !== "object" || value === null) {
      return Boolean(value);
    }

    const operationValue = (value as Record<string, unknown>)[operation];
    if (operationValue === undefined) {
      return true;
    }

    if (typeof operationValue === "boolean") {
      return operationValue;
    }

    return Boolean(operationValue);
  }

  private async listToolDescriptorsIfSupported(
    source: MCPToolSourceConfig,
    context: ClientContext
  ): Promise<McpToolDescription[]> {
    if (!this.supportsCapability(context.serverCapabilities, "tools", "list")) {
      return [];
    }

    const toolsResult = await this.executeRequest<McpToolsListResult>(
      source,
      context,
      "tools/list",
      () => context.client.listTools()
    );

    return toolsResult.tools ?? [];
  }

  private async listResourceDescriptorsIfSupported(
    source: MCPToolSourceConfig,
    context: ClientContext
  ): Promise<McpResourceDescription[]> {
    if (!this.supportsCapability(context.serverCapabilities, "resources", "list")) {
      return [];
    }

    const resourcesResult = await this.executeRequest<McpResourcesListResult>(
      source,
      context,
      "resources/list",
      () => context.client.listResources()
    );

    return resourcesResult.resources ?? [];
  }
}

type SdkModules = {
  Client: Client;
  StreamableHTTPClientTransport: typeof import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  ).StreamableHTTPClientTransport;
  SSEClientTransport: typeof import(
    "@modelcontextprotocol/sdk/client/sse.js"
  ).SSEClientTransport;
};

type StreamableHTTPClientTransportInstance = InstanceType<
  SdkModules["StreamableHTTPClientTransport"]
>;

type SSEClientTransportInstance = InstanceType<
  SdkModules["SSEClientTransport"]
>;

type TransportInstance =
  | StreamableHTTPClientTransportInstance
  | SSEClientTransportInstance;
