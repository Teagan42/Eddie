export const CHAT_SESSION_STATUSES = ["active", "archived"] as const;

export type ChatSessionStatus = (typeof CHAT_SESSION_STATUSES)[number];

export interface ChatSession {
  id: string;
  title: string;
  status: ChatSessionStatus;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

function createStringEnumGuard<T extends readonly string[]>(values: T) {
  const lookup = new Set(values);
  return (value: unknown): value is T[number] =>
    typeof value === "string" && lookup.has(value as T[number]);
}

const isSessionStatus = createStringEnumGuard(CHAT_SESSION_STATUSES);

export function isChatSessionStatus(value: unknown): value is ChatSessionStatus {
  return isSessionStatus(value);
}

export const CHAT_MESSAGE_ROLES = [
  "user",
  "assistant",
  "system",
  "tool",
] as const;

export type ChatMessageRole = (typeof CHAT_MESSAGE_ROLES)[number];

const isMessageRole = createStringEnumGuard(CHAT_MESSAGE_ROLES);

export function isChatMessageRole(value: unknown): value is ChatMessageRole {
  return isMessageRole(value);
}

export interface ChatAgentMetadata {
  id?: string | null;
  name?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  lineage?:
    | Array<
        | string
        | {
            id?: string | null;
            name?: string | null;
          }
      >
    | null;
}

export interface ChatToolMetadata {
  id?: string | null;
  name?: string | null;
  status?: string | null;
}

export type ChatMessageMetadata =
  | null
  | {
      agent?: ChatAgentMetadata | null;
      tool?: ChatToolMetadata | null;
    };

export const CHAT_MESSAGE_REASONING_STATUSES = [
  "streaming",
  "completed",
] as const;

export type ChatMessageReasoningStatus =
  (typeof CHAT_MESSAGE_REASONING_STATUSES)[number];

const isReasoningStatus = createStringEnumGuard(
  CHAT_MESSAGE_REASONING_STATUSES,
);

export function isChatMessageReasoningStatus(
  value: unknown,
): value is ChatMessageReasoningStatus {
  return isReasoningStatus(value);
}

export interface ChatMessageReasoningSegment {
  text?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  agentId?: string | null;
}

export interface ChatMessageReasoning {
  segments?: ChatMessageReasoningSegment[] | null;
  responseId?: string | null;
  status?: ChatMessageReasoningStatus | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  toolCallId?: string | null;
  name?: string | null;
  metadata?: ChatMessageMetadata | null;
  reasoning?: ChatMessageReasoning | null;
}

export const TOOL_CALL_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;

export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

const isToolStatus = createStringEnumGuard(TOOL_CALL_STATUSES);

export function isToolCallStatus(value: unknown): value is ToolCallStatus {
  return isToolStatus(value);
}

export const CONTEXT_UPDATE_SOURCE_TYPES = [
  "tool_call",
  "tool_result",
  "spawn_subagent",
  "session_file",
] as const;

export type ContextUpdateSourceType =
  (typeof CONTEXT_UPDATE_SOURCE_TYPES)[number];

const isContextSource = createStringEnumGuard(CONTEXT_UPDATE_SOURCE_TYPES);

export function isContextUpdateSourceType(
  value: unknown,
): value is ContextUpdateSourceType {
  return isContextSource(value);
}

export interface ExecutionAgentNode {
  id: string;
  name: string;
  provider?: string | null;
  model?: string | null;
  depth: number;
  lineage: string[];
  children: ExecutionAgentNode[];
  metadata?: Record<string, unknown> | null;
}

export interface ExecutionToolInvocationNode {
  id: string;
  agentId: string;
  name: string;
  status: ToolCallStatus;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  args?: unknown;
  result?: unknown;
  children: ExecutionToolInvocationNode[];
}

export interface ExecutionContextBundleFile {
  path: string;
  sizeBytes: number;
  preview?: string | null;
}

export interface ExecutionContextBundle {
  id: string;
  label: string;
  sizeBytes: number;
  fileCount: number;
  summary?: string | null;
  files?: ExecutionContextBundleFile[];
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
  source: {
    type: ContextUpdateSourceType;
    agentId: string;
    toolCallId: string;
  };
}

export type ExecutionAgentLineageMap = Record<string, string[]>;

export type ExecutionContextBundlesByAgentId = Record<
  string,
  ExecutionContextBundle[]
>;

export type ExecutionContextBundlesByToolCallId = Record<
  string,
  ExecutionContextBundle[]
>;

export type ExecutionToolInvocationGroupsByAgentId = Record<
  string,
  Record<ToolCallStatus, ExecutionToolInvocationNode[]>
>;

export interface ExecutionTreeState {
  agentHierarchy: ExecutionAgentNode[];
  toolInvocations: ExecutionToolInvocationNode[];
  contextBundles: ExecutionContextBundle[];
  agentLineageById: ExecutionAgentLineageMap;
  toolGroupsByAgentId: ExecutionToolInvocationGroupsByAgentId;
  contextBundlesByAgentId: ExecutionContextBundlesByAgentId;
  contextBundlesByToolCallId: ExecutionContextBundlesByToolCallId;
  createdAt: string;
  updatedAt: string;
}
