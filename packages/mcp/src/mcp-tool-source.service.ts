import { Injectable } from "@nestjs/common";
import { Buffer } from "buffer";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  CompatibilityCallToolResultSchema,
  ErrorCode,
  McpError,
  type CallToolResult,
  type CompatibilityCallToolResult,
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
import type { EventSourceInit } from "eventsource";
const CLIENT_INFO = { name: "eddie", version: "unknown" } as const;
type CallToolResultPayload = CompatibilityCallToolResult;

interface BuildHttpHeadersOptions {
  accept?: string;
  includeContentType?: boolean;
}

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
      const prompts = await this.discoverPrompts(client, source.id);

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
        name: resource.name,
        uri: resource.uri,
        description:
          typeof resource.description === "string"
            ? resource.description
            : undefined,
        mimeType:
          typeof resource.mimeType === "string" ? resource.mimeType : undefined,
        metadata: this.cloneRecord(resource.metadata),
      }));

      return { tools: toolDefinitions, resources, prompts };
    });
  }

  private async discoverPrompts(
    client: Client,
    sourceId: string
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
          return this.normalizePromptDefinition(
            sourceId,
            descriptor.name,
            result.prompt
          );
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
      const result = await this.callTool(client, toolName, args);
      return this.normalizeToolResult(result, {
        toolName,
        sourceId: source.id,
      });
    });
  }

  private normalizeToolResult(
    result: CallToolResultPayload,
    context: { toolName: string; sourceId: string }
  ): ToolResult {
    if (this.isCompatibilityCallToolResult(result)) {
      return this.normalizeLegacyToolResult(result.toolResult, context);
    }

    const structuredContent = this.cloneRecord(result.structuredContent);
    return this.buildToolResultFromContent(
      result.content,
      structuredContent,
      context,
      "result"
    );
  }

  private isCompatibilityCallToolResult(
    result: CallToolResultPayload
  ): result is Extract<CallToolResultPayload, { toolResult: unknown }> {
    return isRecord(result) && "toolResult" in result;
  }

  private normalizeLegacyToolResult(
    payload: unknown,
    context: { toolName: string; sourceId: string }
  ): ToolResult {
    if (!isRecord(payload)) {
      throw this.createInvalidResultError(context, "legacy result");
    }

    const { schema, content, data, metadata } = payload as {
      schema?: unknown;
      content?: unknown;
      data?: unknown;
      metadata?: unknown;
    };

    if (Array.isArray((payload as { content?: unknown }).content)) {
      const structuredContent = this.cloneRecord(
        (payload as { structuredContent?: unknown }).structuredContent
      );
      return this.buildToolResultFromContent(
        (payload as { content: CallToolResult["content"] }).content,
        structuredContent,
        context,
        "legacy result"
      );
    }

    if (typeof schema !== "string" || typeof content !== "string") {
      throw this.createInvalidResultError(context, "legacy result");
    }

    return {
      schema,
      content,
      data: data !== undefined ? structuredClone(data) : undefined,
      metadata: this.cloneRecord(metadata),
    };
  }

  private computeToolResultSchema(context: {
    toolName: string;
    sourceId: string;
  }): string {
    return `mcp://${context.sourceId}/${context.toolName}`;
  }

  private formatToolResultContent(
    content: CallToolResult["content"] | undefined,
    structuredContent: Record<string, unknown> | undefined
  ): string | undefined {
    const segments = (content ?? []).map((block) => this.describeContentBlock(block));

    if (segments.length > 0) {
      return segments.join("\n");
    }

    if (structuredContent) {
      return JSON.stringify(structuredContent);
    }

    return undefined;
  }

  private describeContentBlock(block: CallToolResult["content"][number]): string {
    switch (block.type) {
      case "text":
        return block.text;
      case "image":
        return `[image:${block.mimeType}]`;
      case "audio":
        return `[audio:${block.mimeType}]`;
      case "resource_link": {
        const name = block.name?.trim();
        return name && name.length > 0 ? name : block.uri;
      }
      default:
        return `[${block.type}]`;
    }
  }

  private buildToolResultFromContent(
    content: CallToolResult["content"] | undefined,
    structuredContent: Record<string, unknown> | undefined,
    context: { toolName: string; sourceId: string },
    label: "result" | "legacy result"
  ): ToolResult {
    const summary = this.formatToolResultContent(content, structuredContent);

    if (summary === undefined) {
      throw this.createInvalidResultError(context, label);
    }

    return {
      schema: this.computeToolResultSchema(context),
      content: summary,
      ...(structuredContent ? { data: structuredClone(structuredContent) } : {}),
    };
  }

  private createInvalidResultError(
    context: { toolName: string; sourceId: string },
    label: "result" | "legacy result"
  ): Error {
    return new Error(
      `Tool ${context.toolName} returned an invalid ${label} payload from MCP source ${context.sourceId}.`
    );
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
        const headers = this.buildHttpHeaders(source, transportConfig.headers, {
          accept: "text/event-stream",
          includeContentType: false,
        });
        const eventSourceInit = { headers } as EventSourceInit & {
          headers?: Record<string, string>;
        };
        return new SSEClientTransport(new URL(transportConfig.url), {
          eventSourceInit,
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
    transportHeaders?: Record<string, string>,
    options?: BuildHttpHeadersOptions
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    const { accept = "application/json", includeContentType = true } =
      options ?? {};

    if (accept) {
      headers.accept = accept;
    }

    if (includeContentType) {
      headers["content-type"] = "application/json";
    }

    Object.assign(headers, source.headers ?? {}, transportHeaders ?? {});

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

  private async callTool(
    client: Client,
    toolName: string,
    args: ToolCallArguments
  ): Promise<CallToolResultPayload> {
    return client.callTool(
      {
        name: toolName,
        arguments: structuredClone(args ?? {}),
      },
      CompatibilityCallToolResultSchema
    );
  }

  private normalizePromptDefinition(
    sourceId: string,
    descriptorName: string,
    prompt: unknown
  ): McpPromptDefinition {
    const location = this.formatPromptLocation(sourceId, descriptorName);
    const {
      name,
      description,
      arguments: rawArguments,
      messages,
    } = this.expectRecord<{
      name?: unknown;
      description?: unknown;
      arguments?: unknown;
      messages?: unknown;
    }>(prompt, `MCP prompt ${location} is not an object`);

    if (typeof name !== "string" || name.trim() === "") {
      throw new Error(`MCP prompt ${location} is missing a name`);
    }

    const promptArguments = this.normalizePromptArguments(
      sourceId,
      name,
      rawArguments
    );
    const promptMessages = this.normalizePromptMessages(
      sourceId,
      name,
      messages
    );

    return {
      name,
      description:
        typeof description === "string" ? description : undefined,
      arguments: promptArguments,
      messages: promptMessages,
    };
  }

  private normalizePromptArguments(
    sourceId: string,
    promptName: string,
    rawArguments: unknown
  ): McpPromptDefinition["arguments"] {
    const location = this.formatPromptLocation(sourceId, promptName);
    if (rawArguments === undefined) {
      return undefined;
    }

    if (!Array.isArray(rawArguments)) {
      throw new Error(`MCP prompt ${location} has invalid arguments`);
    }

    return rawArguments.map((argument, index) => {
      const {
        name,
        description,
        required,
        schema,
      }: {
        name?: unknown;
        description?: unknown;
        required?: unknown;
        schema?: unknown;
      } = this.expectRecord<{
        name?: unknown;
        description?: unknown;
        required?: unknown;
        schema?: unknown;
      }>(
        argument,
        `MCP prompt ${location} argument #${index + 1} is not an object`
      );

      if (typeof name !== "string" || name.trim() === "") {
        throw new Error(
          `MCP prompt ${location} argument #${index + 1} is missing a name`
        );
      }

      return {
        name,
        description:
          typeof description === "string" ? description : undefined,
        required: typeof required === "boolean" ? required : undefined,
        schema: this.cloneRecord(schema),
      };
    });
  }

  private normalizePromptMessages(
    sourceId: string,
    promptName: string,
    rawMessages: unknown
  ): McpPromptDefinition["messages"] {
    const location = this.formatPromptLocation(sourceId, promptName);
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      throw new Error(`MCP prompt ${location} has no messages`);
    }

    return rawMessages.map((message, index) => {
      const { role, content } = this.expectRecord<{
        role?: unknown;
        content?: unknown;
      }>(
        message,
        `MCP prompt ${location} message #${index + 1} is not an object`
      );

      if (typeof role !== "string" || role.trim() === "") {
        throw new Error(
          `MCP prompt ${location} message #${index + 1} is missing a role`
        );
      }

      if (content !== undefined && !Array.isArray(content)) {
        throw new Error(
          `MCP prompt ${location} message #${index + 1} has invalid content`
        );
      }

      return {
        role,
        content: structuredClone((content ?? []) as unknown[]),
      };
    });
  }

  private formatPromptLocation(sourceId: string, promptName: string): string {
    return `${sourceId}/${promptName}`;
  }

  private expectRecord<T extends Record<string, unknown>>(
    value: unknown,
    errorMessage: string
  ): T {
    if (!isRecord(value)) {
      throw new Error(errorMessage);
    }

    return value as T;
  }

  private cloneRecord(value: unknown): Record<string, unknown> | undefined {
    if (!isRecord(value)) {
      return undefined;
    }

    return structuredClone(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
