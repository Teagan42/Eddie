import { Inject, Injectable } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import {
  ExecutionTreeStateUpdatedEvent,
  type AgentRuntimeDescriptor,
  type ExecutionAgentNode,
  type ExecutionContextBundle,
  type ExecutionContextBundleFile,
  type ExecutionContextBundlesByAgentId,
  type ExecutionContextBundlesByToolCallId,
  type ExecutionToolInvocationGroupsByAgentId,
  type ExecutionToolInvocationNode,
  type ExecutionTreeState,
  type ContextUpdateSourceType,
  type StreamEvent,
  type ToolResult,
  type ToolCallStatus,
} from "@eddie/types";
import {
  EXECUTION_TREE_CLOCK,
  type ExecutionTreeClock,
  type ExecutionTreeTrackerOptions,
} from "./execution-tree.tokens";

type ToolCallStreamEvent = Extract<StreamEvent, { type: "tool_call" }>;
type ToolResultStreamEvent = Extract<StreamEvent, { type: "tool_result" }>;

interface RegisterAgentOptions {
  agentId: string;
  parentId?: string;
  descriptor: AgentRuntimeDescriptor;
}

interface ToolInvocationMetadata {
  arguments?: Record<string, unknown>;
  result?: ToolResult;
  contextBundles?: ExecutionContextBundle[];
  error?: { message: string; stack?: string; cause?: unknown };
}

@Injectable()
export class ExecutionTreeStateTracker {
  private readonly now: () => Date;
  private readonly state: ExecutionTreeState;
  private readonly agents = new Map<string, ExecutionAgentNode>();
  private readonly toolInvocationsById = new Map<string, ExecutionToolInvocationNode>();
  private toolCallCounter = 0;
  private readonly sessionId?: string;

  constructor(
    private readonly eventBus: EventBus,
    @Inject(EXECUTION_TREE_CLOCK) clock: ExecutionTreeClock,
    options: ExecutionTreeTrackerOptions = {}
  ) {
    this.now = clock;
    this.sessionId = options.sessionId;
    const timestamp = this.now().toISOString();
    this.state = {
      agentHierarchy: [],
      toolInvocations: [],
      contextBundles: [],
      agentLineageById: {},
      toolGroupsByAgentId: {},
      contextBundlesByAgentId: {},
      contextBundlesByToolCallId: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  registerAgent(options: RegisterAgentOptions): void {
    const { agentId, parentId, descriptor } = options;
    const existing = this.agents.get(agentId);
    if (existing) {
      this.publish();
      return;
    }

    const timestamp = this.now().toISOString();
    const parentNode = parentId ? this.agents.get(parentId) : undefined;
    const lineage = parentNode
      ? [ ...parentNode.lineage, parentNode.id ]
      : [];
    const node: ExecutionAgentNode = {
      id: agentId,
      name: descriptor.metadata?.name ?? descriptor.definition.id,
      provider: descriptor.provider.name,
      model: descriptor.model,
      depth: parentNode ? parentNode.depth + 1 : 0,
      lineage,
      children: [],
    };

    this.agents.set(agentId, node);

    if (parentNode) {
      parentNode.children.push(node);
    }

    this.state.agentHierarchy.push(node);

    this.state.agentLineageById[agentId] = lineage;

    this.touchState(timestamp);
  }

  recordToolCall(agentId: string, event: ToolCallStreamEvent): void {
    const node = this.ensureToolInvocation(agentId, event);
    node.status = "running";
    node.updatedAt = this.now().toISOString();
    node.metadata = this.mergeMetadata(node.metadata, {
      arguments: this.cloneArguments(event.arguments),
    });
    this.rebuildToolGroups();
    this.touchState(node.updatedAt);
  }

  recordToolResult(
    agentId: string,
    event: ToolResultStreamEvent,
    result: ToolResult
  ): void {
    const node = this.ensureToolInvocation(agentId, event);
    node.status = "completed";
    node.updatedAt = this.now().toISOString();
    const bundles = this.recordContextBundles(
      agentId,
      node.id,
      result.metadata
    );
    node.metadata = this.mergeMetadata(node.metadata, {
      result: this.cloneToolResult(result),
      contextBundles: bundles,
    });
    this.rebuildToolGroups();
    this.touchState(node.updatedAt);
  }

  recordToolError(
    agentId: string,
    event: ToolCallStreamEvent,
    error: { message: string; stack?: string; cause?: unknown }
  ): void {
    const node = this.ensureToolInvocation(agentId, event);
    node.status = "failed";
    node.updatedAt = this.now().toISOString();
    node.metadata = this.mergeMetadata(node.metadata, { error });
    this.rebuildToolGroups();
    this.touchState(node.updatedAt);
  }

  recordAgentCompletion(agentId: string): void {
    if (!this.agents.has(agentId)) {
      return;
    }
    this.touchState(this.now().toISOString());
  }

  private ensureToolInvocation(
    agentId: string,
    event: ToolCallStreamEvent | ToolResultStreamEvent
  ): ExecutionToolInvocationNode {
    const existingId = this.findExistingInvocationId(agentId, event);
    const id = existingId ?? this.generateToolCallId(agentId, event);
    let node = this.toolInvocationsById.get(id);

    if (!node) {
      node = {
        id,
        agentId,
        name: event.name,
        status: "pending",
        createdAt: this.now().toISOString(),
        updatedAt: undefined,
        metadata: {},
        children: [],
      };
      this.toolInvocationsById.set(id, node);
      this.state.toolInvocations.push(node);
    }

    node.agentId = agentId;
    node.name = event.name;

    return node;
  }

  private mergeMetadata(
    existing: Record<string, unknown> | undefined,
    incoming: ToolInvocationMetadata
  ): Record<string, unknown> {
    const next: Record<string, unknown> = existing ? { ...existing } : {};
    if (incoming.arguments) {
      next.arguments = incoming.arguments;
    }
    if (incoming.result) {
      next.result = incoming.result;
    }
    if (incoming.contextBundles && incoming.contextBundles.length > 0) {
      next.contextBundles = this.cloneContextBundleList(incoming.contextBundles);
    }
    if (incoming.error) {
      next.error = { ...incoming.error };
    }
    return next;
  }

  private recordContextBundles(
    agentId: string,
    toolCallId: string,
    metadata: Record<string, unknown> | undefined
  ): ExecutionContextBundle[] {
    const bundles = this.extractContextBundles(agentId, toolCallId, metadata);
    if (bundles.length === 0) {
      return [];
    }

    this.removeContextBundles(agentId, toolCallId);
    this.state.contextBundles.push(...bundles);
    this.state.contextBundlesByToolCallId[toolCallId] = this.cloneContextBundleList(bundles);

    const agentBundles = this.state.contextBundlesByAgentId[agentId] ?? [];
    agentBundles.push(...this.cloneContextBundleList(bundles));
    this.state.contextBundlesByAgentId[agentId] = agentBundles;
    return bundles;
  }

  private removeContextBundles(agentId: string, toolCallId: string): void {
    const existing = this.state.contextBundlesByToolCallId[toolCallId];
    if (!existing) {
      return;
    }

    this.state.contextBundles.splice(
      0,
      this.state.contextBundles.length,
      ...this.state.contextBundles.filter((bundle) => bundle.source.toolCallId !== toolCallId)
    );

    const agentBundles = this.state.contextBundlesByAgentId[agentId];
    if (agentBundles) {
      const filtered = agentBundles.filter((bundle) => bundle.source.toolCallId !== toolCallId);
      if (filtered.length > 0) {
        this.state.contextBundlesByAgentId[agentId] = filtered;
      } else {
        delete this.state.contextBundlesByAgentId[agentId];
      }
    }

    delete this.state.contextBundlesByToolCallId[toolCallId];
  }

  private extractContextBundles(
    agentId: string,
    toolCallId: string,
    metadata: Record<string, unknown> | undefined
  ): ExecutionContextBundle[] {
    if (!metadata) {
      return [];
    }

    const rawBundles = metadata.contextBundles;
    const bundles: ExecutionContextBundle[] = [];

    if (Array.isArray(rawBundles)) {
      for (const entry of rawBundles) {
        if (typeof entry !== "object" || entry === null) {
          continue;
        }
        const normalized = this.normalizeContextBundle(entry, agentId, toolCallId);
        if (normalized) {
          bundles.push(normalized);
        }
      }
    }

    const bundleIds = metadata.contextBundleIds;
    if (Array.isArray(bundleIds)) {
      for (const id of bundleIds) {
        if (typeof id !== "string" || id.trim().length === 0) {
          continue;
        }
        bundles.push({
          id,
          label: id,
          sizeBytes: 0,
          fileCount: 0,
          source: {
            type: "tool_result",
            agentId,
            toolCallId,
          },
        });
      }
    }

    return bundles;
  }

  private normalizeContextBundle(
    entry: Record<string, unknown>,
    agentId: string,
    toolCallId: string
  ): ExecutionContextBundle | undefined {
    const id = typeof entry.id === "string" && entry.id.trim().length > 0 ? entry.id : undefined;
    const label = typeof entry.label === "string" && entry.label.trim().length > 0 ? entry.label : id;
    if (!id || !label) {
      return undefined;
    }

    const sizeBytes = typeof entry.sizeBytes === "number" && entry.sizeBytes >= 0 ? entry.sizeBytes : 0;
    const fileCount = typeof entry.fileCount === "number" && entry.fileCount >= 0 ? entry.fileCount : 0;
    const summary = typeof entry.summary === "string" ? entry.summary : undefined;
    let files: ExecutionContextBundleFile[] | undefined;
    if (Array.isArray(entry.files)) {
      files = entry.files
        .filter((file): file is ExecutionContextBundleFile =>
          typeof file === "object" && file !== null && typeof (file as { path?: unknown }).path === "string"
        )
        .map((file) => ({ ...file }));
    }

    const source = this.normalizeBundleSource(entry.source, agentId, toolCallId);

    return {
      id,
      label,
      sizeBytes,
      fileCount,
      summary,
      files,
      source,
    };
  }

  private normalizeBundleSource(
    value: unknown,
    agentId: string,
    toolCallId: string
  ): ExecutionContextBundle["source"] {
    if (typeof value === "object" && value !== null) {
      const candidate = value as { type?: unknown; agentId?: unknown; toolCallId?: unknown };
      const type = this.normalizeSourceType(candidate.type);
      const normalizedAgentId = typeof candidate.agentId === "string" && candidate.agentId.length > 0
        ? candidate.agentId
        : agentId;
      const normalizedToolCallId = typeof candidate.toolCallId === "string" && candidate.toolCallId.length > 0
        ? candidate.toolCallId
        : toolCallId;

      return {
        type,
        agentId: normalizedAgentId,
        toolCallId: normalizedToolCallId,
      };
    }

    return {
      type: "tool_result",
      agentId,
      toolCallId,
    };
  }

  private normalizeSourceType(value: unknown): ContextUpdateSourceType {
    if (value === "tool_call" || value === "tool_result" || value === "spawn_subagent") {
      return value;
    }
    return "tool_result";
  }

  private rebuildToolGroups(): void {
    const groups: ExecutionToolInvocationGroupsByAgentId = {};
    for (const node of this.state.toolInvocations) {
      const agentId = node.agentId;
      const status = node.status;
      const agentGroups = groups[agentId] ?? (groups[agentId] = {} as Record<ToolCallStatus, ExecutionToolInvocationNode[]>);
      const bucket = agentGroups[status] ?? (agentGroups[status] = []);
      if (!bucket.includes(node)) {
        bucket.push(node);
      }
    }
    this.state.toolGroupsByAgentId = groups;
  }

  private touchState(timestamp: string): void {
    this.state.updatedAt = timestamp;
    this.publish();
  }

  private publish(): void {
    const sessionId = this.sessionId;
    if (!sessionId) {
      return;
    }
    const snapshot = this.cloneState(this.state);
    this.eventBus.publish(new ExecutionTreeStateUpdatedEvent(sessionId, snapshot));
  }

  private cloneState(state: ExecutionTreeState): ExecutionTreeState {
    return {
      agentHierarchy: state.agentHierarchy.map((node) => this.cloneAgentNode(node)),
      toolInvocations: state.toolInvocations.map((node) => this.cloneToolInvocation(node)),
      contextBundles: this.cloneContextBundleList(state.contextBundles),
      agentLineageById: { ...state.agentLineageById },
      toolGroupsByAgentId: this.cloneToolGroups(state.toolGroupsByAgentId),
      contextBundlesByAgentId: this.cloneContextBundlesByAgent(state.contextBundlesByAgentId),
      contextBundlesByToolCallId: this.cloneContextBundlesByToolCall(state.contextBundlesByToolCallId),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }

  private cloneAgentNode(node: ExecutionAgentNode): ExecutionAgentNode {
    return {
      id: node.id,
      name: node.name,
      provider: node.provider,
      model: node.model,
      depth: node.depth,
      lineage: [ ...node.lineage ],
      children: node.children.map((child) => this.cloneAgentNode(child)),
    };
  }

  private cloneToolInvocation(node: ExecutionToolInvocationNode): ExecutionToolInvocationNode {
    return {
      id: node.id,
      agentId: node.agentId,
      name: node.name,
      status: node.status,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      metadata: node.metadata ? { ...node.metadata } : undefined,
      children: node.children.map((child) => this.cloneToolInvocation(child)),
    };
  }

  private cloneContextBundle(bundle: ExecutionContextBundle): ExecutionContextBundle {
    return {
      id: bundle.id,
      label: bundle.label,
      sizeBytes: bundle.sizeBytes,
      fileCount: bundle.fileCount,
      summary: bundle.summary,
      files: bundle.files?.map((file) => ({ ...file })),
      source: { ...bundle.source },
    };
  }

  private cloneToolGroups(
    groups: ExecutionToolInvocationGroupsByAgentId
  ): ExecutionToolInvocationGroupsByAgentId {
    const cloned: ExecutionToolInvocationGroupsByAgentId = {};
    for (const [agentId, statuses] of Object.entries(groups)) {
      cloned[agentId] = {} as Record<ToolCallStatus, ExecutionToolInvocationNode[]>;
      for (const [status, list] of Object.entries(statuses) as [ToolCallStatus, ExecutionToolInvocationNode[]][]) {
        cloned[agentId][status] = list.map((node) => this.cloneToolInvocation(node));
      }
    }
    return cloned;
  }

  private cloneContextBundlesByAgent(
    bundles: ExecutionContextBundlesByAgentId
  ): ExecutionContextBundlesByAgentId {
    const cloned: ExecutionContextBundlesByAgentId = {};
    for (const [agentId, list] of Object.entries(bundles)) {
      cloned[agentId] = this.cloneContextBundleList(list);
    }
    return cloned;
  }

  private cloneContextBundlesByToolCall(
    bundles: ExecutionContextBundlesByToolCallId
  ): ExecutionContextBundlesByToolCallId {
    const cloned: ExecutionContextBundlesByToolCallId = {};
    for (const [toolCallId, list] of Object.entries(bundles)) {
      cloned[toolCallId] = this.cloneContextBundleList(list);
    }
    return cloned;
  }

  private cloneContextBundleList(
    bundles: ExecutionContextBundle[]
  ): ExecutionContextBundle[] {
    return bundles.map((bundle) => this.cloneContextBundle(bundle));
  }

  private findExistingInvocationId(
    agentId: string,
    event: ToolCallStreamEvent | ToolResultStreamEvent
  ): string | undefined {
    if (event.id && typeof event.id === "string" && this.toolInvocationsById.has(event.id)) {
      return event.id;
    }

    for (const node of this.state.toolInvocations) {
      if (
        node.agentId === agentId &&
        node.name === event.name &&
        node.status !== "completed" &&
        node.status !== "failed"
      ) {
        return node.id;
      }
    }

    return undefined;
  }

  private generateToolCallId(
    agentId: string,
    event: ToolCallStreamEvent | ToolResultStreamEvent
  ): string {
    if (event.id && typeof event.id === "string" && event.id.length > 0) {
      return event.id;
    }
    this.toolCallCounter += 1;
    return `${agentId}:${event.name}:${this.toolCallCounter}`;
  }

  private cloneToolResult(result: ToolResult): ToolResult {
    return {
      schema: result.schema,
      content: result.content,
      data: result.data ? JSON.parse(JSON.stringify(result.data)) : undefined,
      metadata: result.metadata ? { ...result.metadata } : undefined,
    };
  }

  private cloneArguments(args: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(args));
  }
}
