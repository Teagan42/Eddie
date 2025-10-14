import { env as ProcessEnv } from "process";
export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolCallArguments {
  [key: string]: unknown;
}

export interface ToolOutputSchema extends Record<string, unknown> {
  type: string;
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface ToolSchema {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  outputSchema?: ToolOutputSchema;
}

export interface ToolResult<TData = unknown> {
  /**
   * Canonical identifier for the schema describing {@link ToolResult.data}.
   * Enables consumers to safely discriminate between tool payload shapes.
   */
  schema: string;
  /**
   * Human-readable summary surfaced to the model and CLI logs.
   */
  content: string;
  /**
   * Structured JSON payload that adheres to the schema denoted by
   * {@link ToolResult.schema}.
   */
  data?: TData;
  /**
   * Optional metadata emitted alongside the structured payload.
   */
  metadata?: Record<string, unknown>;
}

export type ToolOutput<TData = unknown> = ToolResult<TData>;

type AgentScopedEvent = {
  agentId?: string;
};

export type StreamEvent =
  | ({
        type: "delta";
        text: string;
        id?: string;
      } & AgentScopedEvent)
  | ({
        type: "tool_call";
        name: string;
        arguments: ToolCallArguments;
        id?: string;
        raw?: unknown;
      } & AgentScopedEvent)
  | ({
        type: "tool_result";
        name: string;
        result: ToolResult;
        id?: string;
      } & AgentScopedEvent)
  | ({
        type: "error";
        message: string;
        cause?: unknown;
      } & AgentScopedEvent)
  | ({
        type: "notification";
        payload: unknown;
        metadata?: Record<string, unknown>;
      } & AgentScopedEvent)
  | ({
        type: "end";
        reason?: string;
        usage?: Record<string, unknown>;
        responseId?: string;
      } & AgentScopedEvent);

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  responseFormat?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  previousResponseId?: string;
}

export interface ProviderAdapter {
  readonly name: string;
  stream(options: StreamOptions): AsyncIterable<StreamEvent>;
}

export interface PackedFile {
  path: string;
  bytes: number;
  content: string;
}

export interface PackedResource {
  id: string;
  type: "bundle" | "template";
  text: string;
  name?: string;
  description?: string;
  files?: PackedFile[];
  metadata?: Record<string, unknown>;
}

export interface PackedContext {
  files: PackedFile[];
  totalBytes: number;
  text: string;
  resources?: PackedResource[];
}

export function composeResourceText(resource: PackedResource): string {
  const label = resource.name ?? resource.id;
  const description = resource.description ? ` - ${resource.description}` : "";
  const body = resource.text.trimEnd();
  const lines = [`// Resource: ${label}${description}`];

  if (body.length > 0) {
    lines.push(body);
  }

  lines.push(`// End Resource: ${label}`);
  return lines.join("\n");
}

export interface ToolExecutionContext {
  cwd: string;
  confirm(message: string): Promise<boolean>;
  env: typeof ProcessEnv;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  jsonSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  handler(
    args: ToolCallArguments,
    ctx: ToolExecutionContext,
  ): Promise<ToolResult>;
}

export * from "./chat-sessions/events";
