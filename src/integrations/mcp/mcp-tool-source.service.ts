import { Injectable } from "@nestjs/common";
import { Buffer } from "buffer";
import type {
  MCPToolSourceConfig,
  MCPAuthConfig,
} from "../../config/types";
import type {
  DiscoveredMcpResource,
  DiscoveredMcpPrompt,
  McpInitializeResult,
  McpPromptDefinition,
  McpPromptDescription,
  McpPromptGetResult,
  McpPromptsListResult,
  McpResourceDescription,
  McpResourcesListResult,
  McpToolDescription,
  McpToolSourceDiscovery,
  McpToolsListResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./types";
import type { ToolDefinition, ToolResult, ToolCallArguments } from "../../core/types";

@Injectable()
export class McpToolSourceService {
  private requestCounter = 0;

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
    const sessionId = await this.initialize(source);
    const tools = await this.listTools(source, sessionId);
    const resources = await this.listResources(source, sessionId);
    const prompts = await this.listPrompts(source, sessionId);
    const promptDefinitions = await Promise.all(
      prompts.map((descriptor) =>
        this.getPrompt(source, sessionId, descriptor.name)
      )
    );

    const toolDefinitions = tools.map((tool) =>
      this.toToolDefinition(source, sessionId, tool)
    );

    return { tools: toolDefinitions, resources, prompts: promptDefinitions };
  }

  private async initialize(source: MCPToolSourceConfig): Promise<string | undefined> {
    const result = await this.sendJsonRpc<McpInitializeResult>(
      source,
      "initialize",
      {
        clientInfo: { name: "eddie", version: "unknown" },
        capabilities: source.capabilities ?? {},
      }
    );

    return result.sessionId;
  }

  private async listTools(
    source: MCPToolSourceConfig,
    sessionId?: string
  ): Promise<McpToolDescription[]> {
    const params = sessionId ? { sessionId } : undefined;
    const result = await this.sendJsonRpc<McpToolsListResult>(
      source,
      "tools/list",
      params
    );
    return (result.tools ?? []).map((tool) => ({
      ...tool,
      inputSchema: structuredClone(tool.inputSchema),
      outputSchema: tool.outputSchema
        ? structuredClone(tool.outputSchema)
        : undefined,
    }));
  }

  private async listResources(
    source: MCPToolSourceConfig,
    sessionId?: string
  ): Promise<McpResourceDescription[]> {
    const params = sessionId ? { sessionId } : undefined;
    const result = await this.sendJsonRpc<McpResourcesListResult>(
      source,
      "resources/list",
      params
    );
    return (result.resources ?? []).map((resource) => ({
      ...resource,
      metadata: resource.metadata ? structuredClone(resource.metadata) : undefined,
    }));
  }

  private async listPrompts(
    source: MCPToolSourceConfig,
    sessionId?: string
  ): Promise<McpPromptDescription[]> {
    const params = sessionId ? { sessionId } : undefined;
    const result = await this.sendJsonRpc<McpPromptsListResult>(
      source,
      "prompts/list",
      params
    );
    return result.prompts ?? [];
  }

  private async getPrompt(
    source: MCPToolSourceConfig,
    sessionId: string | undefined,
    name: string
  ): Promise<McpPromptDefinition> {
    const params: Record<string, unknown> = { name };
    if (sessionId) {
      params.sessionId = sessionId;
    }

    const result = await this.sendJsonRpc<McpPromptGetResult>(
      source,
      "prompts/get",
      params
    );

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
    };
  }

  private toToolDefinition(
    source: MCPToolSourceConfig,
    sessionId: string | undefined,
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
        const result = await this.callTool(source, sessionId, descriptor.name, args);
        if (
          !result ||
          typeof result !== "object" ||
          typeof result.schema !== "string" ||
          typeof result.content !== "string"
        ) {
          throw new Error(
            `Tool ${descriptor.name} returned an invalid result payload from MCP source ${source.id}.`
          );
        }

        const clonedResult: ToolResult = {
          schema: result.schema,
          content: result.content,
          data:
            result.data !== undefined
              ? structuredClone(result.data)
              : undefined,
          metadata:
            result.metadata !== undefined
              ? structuredClone(result.metadata)
              : undefined,
        };

        return clonedResult;
      },
    };
  }

  private async callTool(
    source: MCPToolSourceConfig,
    sessionId: string | undefined,
    name: string,
    args: ToolCallArguments
  ): Promise<ToolResult> {
    const params: Record<string, unknown> = {
      name,
      arguments: structuredClone(args ?? {}),
    };

    if (sessionId) {
      params.sessionId = sessionId;
    }

    return this.sendJsonRpc<ToolResult>(source, "tools/call", params);
  }

  private async sendJsonRpc<T>(
    source: MCPToolSourceConfig,
    method: string,
    params?: unknown
  ): Promise<T> {
    const id = `${source.id}-${++this.requestCounter}`;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
    };

    if (typeof params !== "undefined") {
      request.params = params;
    }

    const headers = this.buildHeaders(source);
    const response = await fetch(source.url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `MCP request to ${source.url} failed with status ${response.status}: ${body}`
      );
    }

    const payload = (await response.json()) as JsonRpcResponse<T>;
    if ("error" in payload) {
      throw new Error(
        `MCP request for ${method} failed: ${payload.error.message}`,
        payload.error.data ? { cause: payload.error } : undefined
      );
    }

    return payload.result;
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
}
