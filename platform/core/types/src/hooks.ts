import type {
  ChatMessage,
  PackedContext,
  StreamEvent,
  ToolResult,
} from "./providers";
import type {
  CliRuntimeOptions,
  EddieConfig,
  TemplateVariables,
} from "./config";

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
  beforeSpawnSubagent: "beforeSpawnSubagent",
  postToolUse: "postToolUse",
  notification: "notification",
  onError: "onError",
  stop: "stop",
  subagentStop: "subagentStop",
} as const;

export type HookEventName = (typeof HOOK_EVENTS)[keyof typeof HOOK_EVENTS];

const HOOK_EVENT_NAME_SET = new Set<HookEventName>(
  Object.values(HOOK_EVENTS)
);

export function isHookEventName(value: unknown): value is HookEventName {
  return typeof value === "string" && HOOK_EVENT_NAME_SET.has(value as HookEventName);
}

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
  model?: string;
  provider?: string;
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

export interface AgentTranscriptCompactionPayload
  extends AgentIterationPayload {
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
  result: ToolResult;
}

export interface SpawnSubagentTargetMetadata {
  name?: string;
  description?: string;
  routingThreshold?: number;
  profileId?: string;
}

export interface SpawnSubagentTargetSummary {
  id: string;
  model: string;
  provider: string;
  metadata?: SpawnSubagentTargetMetadata;
}

export interface SpawnSubagentRequest {
  agentId: string;
  prompt: string;
  variables?: TemplateVariables;
  context?: PackedContext;
  metadata?: Record<string, unknown>;
}

export interface SpawnSubagentDelegateOptions {
  agentId: string;
  prompt: string;
  variables?: TemplateVariables;
  context?: PackedContext;
}

export interface SpawnSubagentDelegateResult {
  prompt: string;
  messages: ChatMessage[];
  target: SpawnSubagentTargetSummary;
}

export type HookAgentRunOptions = SpawnSubagentDelegateOptions;

export type HookAgentRunResult = SpawnSubagentDelegateResult;

export type HookAgentRunner = (
  options: HookAgentRunOptions
) => Promise<HookAgentRunResult>;

export interface SpawnSubagentOverride {
  prompt?: string;
  variables?: TemplateVariables;
  context?: PackedContext;
  allowedSubagents?: string[];
}

export interface SpawnSubagentHookPayload extends AgentLifecyclePayload {
  event: Extract<StreamEvent, { type: "tool_call" }>;
  request: SpawnSubagentRequest;
  target: SpawnSubagentTargetSummary;
  allowedTargets: SpawnSubagentTargetSummary[];
  spawn: (
    options: SpawnSubagentDelegateOptions
  ) => Promise<SpawnSubagentDelegateResult>;
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
  [HOOK_EVENTS.beforeSpawnSubagent]: SpawnSubagentHookPayload;
  [HOOK_EVENTS.postToolUse]: AgentToolResultPayload;
  [HOOK_EVENTS.notification]: AgentNotificationPayload;
  [HOOK_EVENTS.onError]: AgentStreamErrorPayload;
  [HOOK_EVENTS.stop]: AgentIterationPayload;
  [HOOK_EVENTS.subagentStop]: AgentLifecyclePayload;
};

type HookListenerResultMap = {
  [HOOK_EVENTS.stop]: HookStopEnqueueResponse | void | undefined;
} & {
  [K in Exclude<HookEventName, typeof HOOK_EVENTS.stop>]: unknown;
};

export type HookListener<K extends HookEventName> = (
  payload: HookEventMap[K]
) => HookListenerResultMap[K] | Promise<HookListenerResultMap[K]>;

export type HookListenerResult<K extends HookEventName> = Awaited<
  ReturnType<HookListener<K>>
>;

export type HookEventHandlers = {
  [K in HookEventName]?: HookListener<K>;
};

export type HookStopEnqueueMessage = ChatMessage;

export interface HookStopEnqueueResponse {
  continue: true;
  enqueue: HookStopEnqueueMessage[];
}

export function normalizeHookStopMessages(
  messages: HookStopEnqueueMessage[]
): ChatMessage[] {
  return messages.map((message) => {
    const normalized: ChatMessage = {
      role: message.role,
      content: message.content,
    };

    if (message.name) {
      normalized.name = message.name;
    }

    if (message.tool_call_id) {
      normalized.tool_call_id = message.tool_call_id;
    }

    return normalized;
  });
}

export function continueHook(
  ...messages: HookStopEnqueueMessage[]
): HookStopEnqueueResponse {
  return {
    continue: true,
    enqueue: normalizeHookStopMessages(messages),
  };
}

export interface HookBlockResponse {
  blocked: true;
  reason?: string;
}

export interface HookDispatchResult<K extends HookEventName> {
  results: HookListenerResult<K>[];
  blocked?: HookBlockResponse;
  error?: unknown;
}
