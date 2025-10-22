export type ToolCallStatus = "pending" | "running" | "completed" | "failed";

export interface ExecutionAgentNode {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  depth: number;
  metadata?: Record<string, unknown>;
  lineage: string[];
  children: ExecutionAgentNode[];
}

export interface ExecutionToolInvocationNode {
  id: string;
  title?: string;
  agentId: string;
  name: string;
  status: ToolCallStatus;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  children: ExecutionToolInvocationNode[];
  result?: Record<string, unknown>;
  args?: Record<string, unknown>;
}

export interface ExecutionContextBundleFile {
  id?: string;
  path: string;
  name?: string;
  media?: Record<string, unknown>;
  sizeBytes: number;
  preview?: string;
}

export type ContextUpdateSourceType =
  | "tool_call"
  | "tool_result"
  | "spawn_subagent";

export interface ExecutionContextBundle {
  id: string;
  label: string;
  title?: string;
  sizeBytes: number;
  fileCount: number;
  summary?: string;
  files?: ExecutionContextBundleFile[];
  metadata?: Record<string, unknown>;
  media: string;
  type: "text" | "image" | "audio" | "video" | "pdf" | "other";
  createdAt: string;
  source: {
    type: ContextUpdateSourceType;
    agentId: string;
    toolCallId: string;
  };
}

export type ExecutionToolInvocationGroupsByAgentId = Record<
  string,
  Record<ToolCallStatus, ExecutionToolInvocationNode[]>
>;

export type ExecutionContextBundlesByAgentId = Record<string, ExecutionContextBundle[]>;

export type ExecutionContextBundlesByToolCallId = Record<string, ExecutionContextBundle[]>;

export type ExecutionAgentLineageMap = Record<string, string[]>;

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
