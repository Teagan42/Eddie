export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatAgentLineageEntry {
  id?: string | null;
  name?: string | null;
}

export interface ChatAgentMetadata {
  id?: string | null;
  name?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  lineage?: Array<string | ChatAgentLineageEntry | null> | null;
}

export interface ChatToolMetadata {
  id?: string | null;
  name?: string | null;
  status?: string | null;
}

export interface ChatMessageMetadata {
  agent?: ChatAgentMetadata | null;
  tool?: ChatToolMetadata | null;
}

export interface ChatMessageReasoningSegment {
  text?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
  agentId?: string | null;
}

export interface ChatMessageReasoning {
  segments?: ChatMessageReasoningSegment[];
  responseId?: string;
  status?: 'streaming' | 'completed';
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  name?: string | null;
  toolCallId?: string | null;
  metadata?: ChatMessageMetadata | null;
  reasoning?: ChatMessageReasoning | null;
}

export type MessageListItem = ChatMessage;

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ExecutionAgentHierarchyNode {
  id: string;
  name?: string | null;
  role?: string | null;
  status?: string | null;
  children?: ExecutionAgentHierarchyNode[] | null;
}

export interface ExecutionToolInvocationNode {
  id: string;
  name?: string | null;
  status?: ToolCallStatus | null;
  agentId?: string | null;
  args?: unknown;
  result?: unknown;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  children?: ExecutionToolInvocationNode[] | null;
}

export interface ExecutionContextFile {
  id: string;
  name: string;
}

export interface ExecutionContextBundle {
  id: string;
  title: string;
  source?: unknown;
  files?: ExecutionContextFile[] | null;
  metadata?: Record<string, unknown> | null;
}

export type ExecutionContextBundlesByAgentId = Record<string, ExecutionContextBundle[] | undefined>;

export type ExecutionToolInvocationGroupsByAgentId = Record<
  string,
  Partial<Record<ToolCallStatus, ExecutionToolInvocationNode[]>> | undefined
>;

export interface ExecutionTreeState {
  agentHierarchy: ExecutionAgentHierarchyNode[];
  toolInvocations: ExecutionToolInvocationNode[];
  contextBundles: ExecutionContextBundle[];
  contextBundlesByAgentId: ExecutionContextBundlesByAgentId;
  toolGroupsByAgentId: ExecutionToolInvocationGroupsByAgentId;
  agentLineageById: Record<string, string[]>;
}
