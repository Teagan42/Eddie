export type ToolCallStatus = "pending" | "running" | "completed" | "failed";

export interface ExecutionAgentNode {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  depth: number;
  lineage: string[];
  children: ExecutionAgentNode[];
}

export interface ExecutionToolInvocationNode {
  id: string;
  agentId: string;
  name: string;
  status: ToolCallStatus;
  metadata?: Record<string, unknown>;
  children: ExecutionToolInvocationNode[];
}

export interface ExecutionContextBundleFile {
  path: string;
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
  sizeBytes: number;
  fileCount: number;
  summary?: string;
  files?: ExecutionContextBundleFile[];
  source: {
    type: ContextUpdateSourceType;
    agentId: string;
    toolCallId: string;
  };
}

export interface ExecutionTreeSnapshot {
  agentHierarchy: ExecutionAgentNode[];
  toolInvocations: ExecutionToolInvocationNode[];
  contextBundles: ExecutionContextBundle[];
}
