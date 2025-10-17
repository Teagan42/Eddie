export type ToolCallStatus = "pending" | "running" | "completed" | "failed";

interface AgentNodeRecord {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  parentId?: string;
  children: Set<string>;
}

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

interface ToolInvocationRecord {
  id: string;
  agentId: string;
  name: string;
  status: ToolCallStatus;
  metadata?: Record<string, unknown>;
  parentId?: string;
  children: Set<string>;
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

interface RegisterAgentInput {
  id: string;
  name: string;
  provider?: string;
  model?: string;
  parentId?: string;
}

interface RecordToolInvocationInput {
  id: string;
  agentId: string;
  name: string;
  status: ToolCallStatus;
  metadata?: Record<string, unknown>;
  parentInvocationId?: string;
}

const TOOL_STATUSES: ToolCallStatus[] = [
  "pending",
  "running",
  "completed",
  "failed",
];

interface ContextBundleInput {
  id: string;
  label: string;
  sizeBytes: number;
  fileCount: number;
  summary?: string;
  files?: ExecutionContextBundleFile[];
}

interface RecordContextBundleUpdateInput extends ContextBundleInput {
  agentId: string;
  toolCallId: string;
  sourceType: ContextUpdateSourceType;
}

interface RecordSpawnSubagentInput {
  toolCallId: string;
  agentId: string;
  spawnedAgentId: string;
  name?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  contextBundle?: ContextBundleInput;
}

export class ExecutionTreeState {
  private readonly agents = new Map<string, AgentNodeRecord>();
  private readonly toolInvocations = new Map<string, ToolInvocationRecord>();
  private readonly contextBundles = new Map<string, ExecutionContextBundle>();

  registerAgent(input: RegisterAgentInput): void {
    const node = this.getOrCreateRecord(input.id);
    const previousParent = node.parentId;

    node.name = input.name;
    node.provider = input.provider;
    node.model = input.model;
    node.parentId = input.parentId;

    if (previousParent && previousParent !== input.parentId) {
      const previousParentNode = this.agents.get(previousParent);
      previousParentNode?.children.delete(node.id);
    }

    if (input.parentId) {
      const parent = this.getOrCreateRecord(input.parentId);
      parent.children.add(input.id);
    }
  }

  recordToolInvocation(input: RecordToolInvocationInput): void {
    const invocation = this.getOrCreateToolInvocation(input.id);
    const previousParent = invocation.parentId;

    invocation.agentId = input.agentId;
    invocation.name = input.name;
    invocation.status = input.status;
    this.mergeInvocationMetadata(invocation, input.metadata);
    invocation.parentId = input.parentInvocationId;

    if (previousParent && previousParent !== invocation.parentId) {
      const previousParentNode = this.toolInvocations.get(previousParent);
      previousParentNode?.children.delete(invocation.id);
    }

    if (invocation.parentId) {
      const parent = this.getOrCreateToolInvocation(invocation.parentId);
      parent.children.add(invocation.id);
    }
  }

  getToolStatusGroups(
    agentId: string
  ): Map<ToolCallStatus, ExecutionToolInvocationNode[]> {
    const groups = this.createEmptyToolGroups();

    for (const invocation of this.toolInvocations.values()) {
      if (invocation.agentId !== agentId) {
        continue;
      }

      const serialized = this.serializeToolInvocation(invocation);
      const bucket = groups.get(invocation.status);
      if (!bucket) {
        groups.set(invocation.status, [serialized]);
        continue;
      }

      bucket.push(serialized);
    }

    return groups;
  }

  recordContextBundleUpdate(input: RecordContextBundleUpdateInput): void {
    this.contextBundles.set(input.id, {
      id: input.id,
      label: input.label,
      sizeBytes: input.sizeBytes,
      fileCount: input.fileCount,
      summary: input.summary,
      files: input.files,
      source: {
        type: input.sourceType,
        agentId: input.agentId,
        toolCallId: input.toolCallId,
      },
    });
  }

  recordSpawnSubagent(input: RecordSpawnSubagentInput): void {
    const invocation = this.getOrCreateToolInvocation(input.toolCallId);
    invocation.agentId = input.agentId;
    this.mergeInvocationMetadata(invocation, input.metadata);
    this.mergeInvocationMetadata(invocation, this.createSpawnMetadata(input));

    if (input.contextBundle) {
      this.recordContextBundleUpdate({
        ...input.contextBundle,
        agentId: input.agentId,
        toolCallId: input.toolCallId,
        sourceType: "spawn_subagent",
      });
    }
  }

  getSnapshot(): ExecutionTreeSnapshot {
    return {
      agentHierarchy: this.serializeAgentHierarchy(),
      toolInvocations: this.serializeToolInvocationForest(),
      contextBundles: Array.from(this.contextBundles.values()),
    };
  }

  private getOrCreateRecord(id: string): AgentNodeRecord {
    const existing = this.agents.get(id);
    if (existing) {
      return existing;
    }

    const record: AgentNodeRecord = {
      id,
      name: "",
      children: new Set<string>(),
    };

    this.agents.set(id, record);
    return record;
  }

  private getOrCreateToolInvocation(id: string): ToolInvocationRecord {
    const existing = this.toolInvocations.get(id);
    if (existing) {
      return existing;
    }

    const record: ToolInvocationRecord = {
      id,
      agentId: "",
      name: "",
      status: "pending",
      children: new Set<string>(),
    };

    this.toolInvocations.set(id, record);
    return record;
  }

  private serializeAgentHierarchy(): ExecutionAgentNode[] {
    const roots: AgentNodeRecord[] = [];

    for (const node of this.agents.values()) {
      if (!node.parentId || !this.agents.has(node.parentId)) {
        roots.push(node);
      }
    }

    const sortByName = (a: AgentNodeRecord, b: AgentNodeRecord): number =>
      a.name.localeCompare(b.name);

    roots.sort(sortByName);

    const serialize = (
      node: AgentNodeRecord,
      ancestors: string[]
    ): ExecutionAgentNode => {
      const lineage = [...ancestors, node.id];
      const children = Array.from(node.children)
        .map((childId) => this.agents.get(childId))
        .filter((child): child is AgentNodeRecord => Boolean(child))
        .sort(sortByName)
        .map((child) => serialize(child, lineage));

      return {
        id: node.id,
        name: node.name,
        provider: node.provider,
        model: node.model,
        depth: ancestors.length,
        lineage,
        children,
      };
    };

    return roots.map((node) => serialize(node, []));
  }

  private serializeToolInvocation(invocation: ToolInvocationRecord): ExecutionToolInvocationNode {
    const children = Array.from(invocation.children)
      .map((childId) => this.toolInvocations.get(childId))
      .filter((child): child is ToolInvocationRecord => Boolean(child))
      .map((child) => this.serializeToolInvocation(child));

    return {
      id: invocation.id,
      agentId: invocation.agentId,
      name: invocation.name,
      status: invocation.status,
      metadata: invocation.metadata,
      children,
    };
  }

  private serializeToolInvocationForest(): ExecutionToolInvocationNode[] {
    const roots: ToolInvocationRecord[] = [];

    for (const invocation of this.toolInvocations.values()) {
      if (!invocation.parentId || !this.toolInvocations.has(invocation.parentId)) {
        roots.push(invocation);
      }
    }

    return roots.map((invocation) => this.serializeToolInvocation(invocation));
  }

  private createEmptyToolGroups(): Map<ToolCallStatus, ExecutionToolInvocationNode[]> {
    return new Map(TOOL_STATUSES.map((status) => [status, []]));
  }

  private mergeInvocationMetadata(
    invocation: ToolInvocationRecord,
    metadata: Record<string, unknown> | undefined
  ): void {
    if (!metadata || Object.keys(metadata).length === 0) {
      return;
    }

    invocation.metadata = {
      ...(invocation.metadata ?? {}),
      ...metadata,
    };
  }

  private createSpawnMetadata(
    input: RecordSpawnSubagentInput
  ): Record<string, unknown> {
    const spawn: Record<string, unknown> = {
      agentId: input.spawnedAgentId,
    };

    if (input.name) {
      spawn.name = input.name;
    }
    if (input.provider) {
      spawn.provider = input.provider;
    }
    if (input.model) {
      spawn.model = input.model;
    }

    return { spawn };
  }
}
