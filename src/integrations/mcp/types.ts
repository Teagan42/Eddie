import type { ToolDefinition } from "../../core/types";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: string | number | null;
  result: T;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcError;

export interface McpInitializeResult {
  sessionId?: string;
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: Record<string, unknown>;
}

export interface McpToolDescription {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface McpResourceDescription {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface McpToolsListResult {
  tools?: McpToolDescription[];
}

export interface McpResourcesListResult {
  resources?: McpResourceDescription[];
}

export interface McpToolSourceDiscovery {
  sourceId: string;
  tools: ToolDefinition[];
  resources: McpResourceDescription[];
}
