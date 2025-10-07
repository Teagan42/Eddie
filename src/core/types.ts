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

export interface ToolSchema {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export type StreamEvent =
  | {
      type: "delta";
      text: string;
      id?: string;
    }
  | {
      type: "tool_call";
      name: string;
      arguments: ToolCallArguments;
      id?: string;
      raw?: unknown;
    }
  | {
      type: "tool_result";
      name: string;
      result: unknown;
      id?: string;
    }
  | {
      type: "error";
      message: string;
      cause?: unknown;
    }
  | {
      type: "end";
      reason?: string;
      usage?: Record<string, unknown>;
    };

export interface StreamOptions {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSchema[];
  responseFormat?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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

export interface PackedContext {
  files: PackedFile[];
  totalBytes: number;
  text: string;
}

import type { ProcessEnv } from "node:process";

export interface ToolExecutionContext {
  cwd: string;
  confirm(message: string): Promise<boolean>;
  env: ProcessEnv;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  jsonSchema: Record<string, unknown>;
  validate?: (data: unknown) => boolean;
  handler(
    args: ToolCallArguments,
    ctx: ToolExecutionContext
  ): Promise<{ content: string; metadata?: Record<string, unknown> }>;
}
