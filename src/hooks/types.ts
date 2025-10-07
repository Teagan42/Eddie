import type { ChatMessage, PackedContext, StreamEvent } from "../core/types";
import type { CliRuntimeOptions, EddieConfig } from "../config/types";

export interface AgentMetadata {
  id: string;
  parentId?: string;
  depth: number;
  isRoot: boolean;
  systemPrompt: string;
  tools: string[];
}

export interface AgentContextSummary {
  totalBytes: number;
  fileCount: number;
}

export interface AgentLifecyclePayload {
  metadata: AgentMetadata;
  prompt: string;
  context: AgentContextSummary;
  historyLength: number;
}

export interface AgentIterationPayload extends AgentLifecyclePayload {
  iteration: number;
  messages: ChatMessage[];
}

export interface AgentCompletionPayload extends AgentLifecyclePayload {
  messages: ChatMessage[];
  iterations: number;
}

export interface AgentToolCallPayload extends AgentLifecyclePayload {
  iteration: number;
  event: Extract<StreamEvent, { type: "tool_call" }>;
}

export interface AgentToolResultPayload extends AgentLifecyclePayload {
  iteration: number;
  event: Extract<StreamEvent, { type: "tool_call" }>;
  result: { content: string; metadata?: Record<string, unknown> };
}

export interface AgentStreamErrorPayload extends AgentLifecyclePayload {
  iteration: number;
  error: Extract<StreamEvent, { type: "error" }>;
}

export interface AgentErrorPayload extends AgentLifecyclePayload {
  error: { message: string; stack?: string; cause?: unknown };
}

export interface AgentNotificationPayload extends AgentLifecyclePayload {
  iteration: number;
  event: Extract<StreamEvent, { type: "notification" }>;
}

export interface HookEventMap {
  beforeContextPack: { config: EddieConfig; options: CliRuntimeOptions };
  afterContextPack: { context: PackedContext };
  beforeAgentStart: AgentLifecyclePayload;
  afterAgentComplete: AgentCompletionPayload;
  onAgentError: AgentErrorPayload;
  beforeModelCall: AgentIterationPayload;
  PreToolUse: AgentToolCallPayload;
  PostToolUse: AgentToolResultPayload;
  Notification: AgentNotificationPayload;
  onError: AgentStreamErrorPayload;
  Stop: AgentIterationPayload;
  SubagentStop: AgentLifecyclePayload;
}

export type HookEventName = keyof HookEventMap;

export type HookListener<K extends HookEventName> = (
  payload: HookEventMap[K]
) => unknown | Promise<unknown>;

export type HookListenerResult<K extends HookEventName> = Awaited<
  ReturnType<HookListener<K>>
>;

export interface HookBlockResponse {
  blocked: true;
  reason?: string;
}

export interface HookDispatchResult<K extends HookEventName> {
  results: HookListenerResult<K>[];
  blocked?: HookBlockResponse;
  error?: unknown;
}

export function blockHook(reason?: string): HookBlockResponse {
  return { blocked: true, reason };
}

export function isHookBlockResponse(value: unknown): value is HookBlockResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "blocked" in value &&
    (value as HookBlockResponse).blocked === true
  );
}

export type HookEventHandlers = {
  [K in HookEventName]?: HookListener<K>;
};

export const hookEventNames: HookEventName[] = [
  "beforeContextPack",
  "afterContextPack",
  "beforeAgentStart",
  "afterAgentComplete",
  "onAgentError",
  "beforeModelCall",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "onError",
  "Stop",
  "SubagentStop",
];

export function isHookEventName(value: string): value is HookEventName {
  return (hookEventNames as readonly string[]).includes(value);
}
