import type { ChatMessage, PackedContext, StreamEvent } from "../core/types";
import type { CliRuntimeOptions, EddieConfig } from "../config/types";

export const HOOK_EVENTS = {
  beforeContextPack: "beforeContextPack",
  afterContextPack: "afterContextPack",
  sessionStart: "sessionStart",
  userPromptSubmit: "userPromptSubmit",
  sessionEnd: "sessionEnd",
  beforeAgentStart: "beforeAgentStart",
  afterAgentComplete: "afterAgentComplete",
  onAgentError: "onAgentError",
  beforeModelCall: "beforeModelCall",
  preCompact: "preCompact",
  preToolUse: "preToolUse",
  postToolUse: "postToolUse",
  notification: "notification",
  onError: "onError",
  stop: "stop",
  subagentStop: "subagentStop",
} as const;

export type HookEventName = (typeof HOOK_EVENTS)[keyof typeof HOOK_EVENTS];

export interface SessionMetadata {
  id: string;
  startedAt: string;
  prompt: string;
  provider: string;
  model: string;
  tracePath?: string;
}

export type SessionStatus = "success" | "error";

export interface SessionStartPayload {
  metadata: SessionMetadata;
  config: EddieConfig;
  options: CliRuntimeOptions;
}

export interface SessionEndPayload {
  metadata: SessionMetadata;
  status: SessionStatus;
  durationMs: number;
  result?: {
    messageCount: number;
    agentCount: number;
    contextBytes: number;
  };
  error?: { message: string; stack?: string; cause?: unknown };
}

export interface UserPromptSubmitPayload {
  metadata: SessionMetadata;
  prompt: string;
  historyLength: number;
  options: CliRuntimeOptions;
}

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

export interface AgentTranscriptCompactionPayload extends AgentIterationPayload {
  reason?: string;
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

export type HookEventMap = {
  [HOOK_EVENTS.beforeContextPack]: {
    config: EddieConfig;
    options: CliRuntimeOptions;
  };
  [HOOK_EVENTS.afterContextPack]: { context: PackedContext };
  [HOOK_EVENTS.sessionStart]: SessionStartPayload;
  [HOOK_EVENTS.userPromptSubmit]: UserPromptSubmitPayload;
  [HOOK_EVENTS.sessionEnd]: SessionEndPayload;
  [HOOK_EVENTS.beforeAgentStart]: AgentLifecyclePayload;
  [HOOK_EVENTS.afterAgentComplete]: AgentCompletionPayload;
  [HOOK_EVENTS.onAgentError]: AgentErrorPayload;
  [HOOK_EVENTS.beforeModelCall]: AgentIterationPayload;
  [HOOK_EVENTS.preCompact]: AgentTranscriptCompactionPayload;
  [HOOK_EVENTS.preToolUse]: AgentToolCallPayload;
  [HOOK_EVENTS.postToolUse]: AgentToolResultPayload;
  [HOOK_EVENTS.notification]: AgentNotificationPayload;
  [HOOK_EVENTS.onError]: AgentStreamErrorPayload;
  [HOOK_EVENTS.stop]: AgentIterationPayload;
  [HOOK_EVENTS.subagentStop]: AgentLifecyclePayload;
};

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

export const hookEventNames = Object.values(HOOK_EVENTS) as HookEventName[];

export function isHookEventName(value: string): value is HookEventName {
  return (hookEventNames as readonly string[]).includes(value);
}
