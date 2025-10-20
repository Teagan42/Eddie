import { Injectable, Optional } from "@nestjs/common";
import {
  ChatSessionsService,
  type AgentInvocationSnapshot,
} from "../chat-sessions/chat-sessions.service";
import { ChatMessageRole } from "../chat-sessions/dto/create-chat-message.dto";
import {
  ContextBundleDto,
  OrchestratorMetadataDto,
  ToolCallNodeDto,
  ToolCallStatusDto,
  AgentHierarchyNodeDto,
} from "./dto/orchestrator-metadata.dto";
import { ChatMessageDto } from "../chat-sessions/dto/chat-session.dto";
import { ExecutionTreeStateStore } from "./execution-tree-state.store";
import type {
  ExecutionTreeState,
  ExecutionAgentNode,
  ExecutionToolInvocationNode,
  ExecutionContextBundle,
} from "@eddie/types";
import { ToolCallStore, type ToolCallState } from "../tools/tool-call.store";

interface SpawnDetails {
  provider?: string;
  model?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class OrchestratorMetadataService {
  private static readonly SPAWN_RESULT_SCHEMA =
    "eddie.tool.spawn_subagent.result.v1";

  constructor(
    private readonly chatSessions: ChatSessionsService,
    private readonly executionTreeStateStore?: ExecutionTreeStateStore,
    @Optional() private readonly toolCallStore?: ToolCallStore,
  ) {}

  async getMetadata(sessionId?: string): Promise<OrchestratorMetadataDto> {
    if (!sessionId) {
      return this.createEmptySnapshot();
    }

    const cachedState = this.executionTreeStateStore?.get(sessionId);
    if (cachedState) {
      return this.createSnapshotFromExecutionTree(sessionId, cachedState);
    }

    const session = await this.chatSessions.getSession(sessionId);
    const messages = await this.chatSessions.listMessages(sessionId);
    const agentInvocations = await this.chatSessions.listAgentInvocations(
      sessionId
    );

    const contextBundles = this.createContextBundles(sessionId, messages.length);
    const toolInvocations = this.resolveToolInvocations(
      sessionId,
      messages,
      agentInvocations,
    );
    const agentHierarchy = this.createAgentHierarchy(
      session.title,
      sessionId,
      messages.length,
      agentInvocations,
    );

    return {
      sessionId,
      capturedAt: new Date().toISOString(),
      contextBundles,
      toolInvocations,
      agentHierarchy,
    };
  }

  private createEmptySnapshot(): OrchestratorMetadataDto {
    return {
      capturedAt: new Date().toISOString(),
      contextBundles: [],
      toolInvocations: [],
      agentHierarchy: [],
    };
  }

  private createSnapshotFromExecutionTree(
    sessionId: string,
    state: ExecutionTreeState,
  ): OrchestratorMetadataDto {
    return {
      sessionId,
      capturedAt: state.updatedAt,
      contextBundles: state.contextBundles.map((bundle) =>
        this.mapContextBundle(bundle)
      ),
      toolInvocations: state.toolInvocations.map((node) =>
        this.mapToolInvocation(node)
      ),
      agentHierarchy: state.agentHierarchy.map((node) =>
        this.mapAgentHierarchy(node)
      ),
    };
  }

  private mapAgentHierarchy(node: ExecutionAgentNode): AgentHierarchyNodeDto {
    const dto = new AgentHierarchyNodeDto();
    dto.id = node.id;
    dto.name = node.name;
    if (node.provider) {
      dto.provider = node.provider;
    }
    if (node.model) {
      dto.model = node.model;
    }
    if (typeof node.depth === "number") {
      dto.depth = node.depth;
    }
    dto.children = node.children.map((child) => this.mapAgentHierarchy(child));
    return dto;
  }

  private mapToolInvocation(
    node: ExecutionToolInvocationNode
  ): ToolCallNodeDto {
    const dto = new ToolCallNodeDto();
    dto.id = node.id;
    dto.name = node.name;
    dto.status = this.mapToolStatus(node.status);
    const metadata: Record<string, unknown> = {
      ...(node.metadata ?? {}),
    };
    if (node.agentId) {
      metadata.agentId = node.agentId;
    }
    if (node.createdAt) {
      metadata.createdAt = node.createdAt;
    }
    if (node.updatedAt) {
      metadata.updatedAt = node.updatedAt;
    }
    if (Object.keys(metadata).length > 0) {
      dto.metadata = metadata;
    }
    dto.children = node.children.map((child) => this.mapToolInvocation(child));
    return dto;
  }

  private mapToolStatus(status: string): ToolCallStatusDto {
    switch (status) {
      case "pending":
        return ToolCallStatusDto.Pending;
      case "running":
        return ToolCallStatusDto.Running;
      case "failed":
        return ToolCallStatusDto.Failed;
      case "completed":
      default:
        return ToolCallStatusDto.Completed;
    }
  }

  private mapContextBundle(bundle: ExecutionContextBundle): ContextBundleDto {
    const dto = new ContextBundleDto();
    dto.id = bundle.id;
    dto.label = bundle.label;
    dto.sizeBytes = bundle.sizeBytes;
    dto.fileCount = bundle.fileCount;
    if (bundle.summary) {
      dto.summary = bundle.summary;
    }
    if (bundle.files) {
      dto.files = bundle.files.map((file) => ({
        path: file.path,
        sizeBytes: file.sizeBytes,
        ...(file.preview ? { preview: file.preview } : {}),
      }));
    }
    return dto;
  }

  private createContextBundles(
    sessionId: string,
    messageCount: number
  ): ContextBundleDto[] {
    return [
      {
        id: `${sessionId}-history`,
        label: "Session history",
        summary: `${messageCount} messages captured in runtime context`,
        sizeBytes: Math.max(messageCount * 280, 0),
        fileCount: 0,
        files: [],
      },
    ];
  }

  private resolveToolInvocations(
    sessionId: string,
    messages: ChatMessageDto[],
    agentInvocations: AgentInvocationSnapshot[],
  ): ToolCallNodeDto[] {
    const fromStore = this.createToolInvocationsFromStore(sessionId);

    if (agentInvocations.length === 0) {
      if (fromStore.length > 0) {
        return fromStore;
      }
      return this.createToolInvocationsFromMessages(sessionId, messages);
    }

    const fromAgents = this.createToolInvocationsFromAgents(agentInvocations);
    if (fromAgents.length > 0) {
      return fromAgents;
    }

    if (fromStore.length > 0) {
      return fromStore;
    }

    return this.createToolInvocationsFromMessages(sessionId, messages);
  }

  private createToolInvocationsFromStore(sessionId: string): ToolCallNodeDto[] {
    if (!this.toolCallStore) {
      return [];
    }

    const states = this.toolCallStore.list(sessionId);
    if (states.length === 0) {
      return [];
    }

    return states.map((state, index) => this.mapToolCallState(state, sessionId, index));
  }

  private mapToolCallState(
    state: ToolCallState,
    sessionId: string,
    index: number,
  ): ToolCallNodeDto {
    const node = new ToolCallNodeDto();
    node.id = state.toolCallId ?? `${sessionId}-tool-${index}`;
    node.name = state.name ?? node.id;
    node.status = this.mapToolStatus(state.status);
    const metadata: Record<string, unknown> = {
      ...(state.toolCallId ? { toolCallId: state.toolCallId } : {}),
      ...(state.arguments !== undefined ? { arguments: state.arguments } : {}),
      ...(state.result !== undefined ? { result: state.result } : {}),
      ...(state.agentId !== undefined ? { agentId: state.agentId } : {}),
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
    };
    node.metadata = metadata;
    node.children = [];
    return node;
  }

  private createToolInvocationsFromMessages(
    sessionId: string,
    messages: ChatMessageDto[]
  ): ToolCallNodeDto[] {
    const toolMessages = messages
      .filter(
        (message) =>
          message.role === ChatMessageRole.Tool ||
          message.role === ChatMessageRole.System
      )
      .map((message) => ({ ...message, content: message.content.trim() }))
      .filter((message) => message.content.length > 0);

    return toolMessages.map((message, index) => {
      const node = new ToolCallNodeDto();
      node.id = message.toolCallId ?? `${sessionId}-tool-${index}`;
      node.name = message.name ?? this.extractToolName(message.content);
      node.status = ToolCallStatusDto.Completed;
      const payload = this.parseToolPayload(message.content);
      const args = payload.isJson
        ? null
        : this.extractToolArguments(message.content);
      node.metadata = {
        preview: payload.preview,
        createdAt: message.createdAt,
        ...(payload.isJson
          ? { payload: payload.value }
          : { command: message.content }),
        ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
        ...(message.name ? { toolName: message.name } : {}),
        ...(args ? { arguments: args } : {}),
      };
      node.children = [];
      return node;
    });
  }

  private createToolInvocationsFromAgents(
    agents: AgentInvocationSnapshot[]
  ): ToolCallNodeDto[] {
    const nodes: ToolCallNodeDto[] = [];

    for (const agent of agents) {
      nodes.push(...this.collectAgentToolInvocations(agent));
    }

    return nodes;
  }

  private collectAgentToolInvocations(
    agent: AgentInvocationSnapshot
  ): ToolCallNodeDto[] {
    const nodes = this.extractAgentToolInvocations(agent);

    for (const child of agent.children) {
      const childNodes = this.collectAgentToolInvocations(child);
      const parent = this.findSpawnNodeForAgent(nodes, child.id);
      if (parent) {
        parent.children.push(...childNodes);
      } else {
        nodes.push(...childNodes);
      }
    }

    return nodes;
  }

  private extractAgentToolInvocations(
    agent: AgentInvocationSnapshot
  ): ToolCallNodeDto[] {
    const nodes: ToolCallNodeDto[] = [];
    const pending = new Map<string, ToolCallNodeDto>();
    const appendAgentMetadata = (
      metadata: Record<string, unknown> | undefined
    ): Record<string, unknown> => ({
      ...(metadata ?? {}),
      agentId: agent.id,
    });

    for (const message of agent.messages) {
      const toolCallId = message.toolCallId;
      if (!toolCallId) {
        continue;
      }

      if (message.role === ChatMessageRole.Assistant) {
        const node = pending.get(toolCallId) ?? new ToolCallNodeDto();
        node.id = toolCallId;
        node.name =
          node.name ??
          message.name ??
          this.extractToolName(message.content);
        node.status = ToolCallStatusDto.Pending;
        const payload = this.parseToolPayload(message.content);
        const baseMetadata = appendAgentMetadata(node.metadata);
        node.metadata = {
          ...baseMetadata,
          preview: payload.preview,
          ...(toolCallId ? { toolCallId } : {}),
          ...(node.metadata?.toolName
            ? {}
            : message.name
              ? { toolName: message.name }
              : {}),
        };
        node.children = node.children ?? [];
        if (!pending.has(toolCallId)) {
          nodes.push(node);
        }
        pending.set(toolCallId, node);
        continue;
      }

      if (message.role !== ChatMessageRole.Tool) {
        continue;
      }

      const payload = this.parseToolPayload(message.content);
      const existing = pending.get(toolCallId);
      if (existing) {
        existing.status = ToolCallStatusDto.Completed;
        existing.name =
          existing.name ??
          message.name ??
          this.extractToolName(message.content);
        const baseMetadata = appendAgentMetadata(existing.metadata);
        existing.metadata = {
          ...baseMetadata,
          preview: payload.preview,
          ...(payload.isJson
            ? { payload: payload.value }
            : { command: message.content }),
          ...(toolCallId ? { toolCallId } : {}),
          ...(existing.metadata?.toolName
            ? {}
            : message.name
              ? { toolName: message.name }
              : {}),
        };
        pending.delete(toolCallId);
        continue;
      }

      const node = new ToolCallNodeDto();
      node.id = toolCallId;
      const resolvedToolName = message.name ?? null;
      node.name =
        resolvedToolName ?? this.extractToolName(message.content);
      node.status = ToolCallStatusDto.Completed;
      node.metadata = appendAgentMetadata({
        preview: payload.preview,
        ...(payload.isJson
          ? { payload: payload.value }
          : { command: message.content }),
        ...(toolCallId ? { toolCallId } : {}),
        ...(resolvedToolName ? { toolName: resolvedToolName } : {}),
      });
      node.children = [];
      nodes.push(node);
    }

    return nodes;
  }

  private findSpawnNodeForAgent(
    nodes: ToolCallNodeDto[],
    agentId: string
  ): ToolCallNodeDto | null {
    for (const node of nodes) {
      const payload = node.metadata?.payload;
      const childAgentId = this.extractAgentIdFromPayload(payload);
      if (childAgentId === agentId) {
        return node;
      }
    }

    return null;
  }

  private parseToolPayload(
    content: string
  ): { isJson: boolean; value: unknown; preview: string } {
    const trimmed = content.trim();
    if (!trimmed) {
      return { isJson: false, value: trimmed, preview: "" };
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        const preview = this.extractPreviewFromObject(parsed) ?? trimmed;
        return { isJson: true, value: parsed, preview };
      }
      return { isJson: false, value: trimmed, preview: trimmed.slice(0, 120) };
    } catch {
      return { isJson: false, value: trimmed, preview: trimmed.slice(0, 120) };
    }
  }

  private extractAgentIdFromPayload(value: unknown): string | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const metadata = (value as { metadata?: unknown }).metadata;
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    const agentId = (metadata as { agentId?: unknown }).agentId;
    return typeof agentId === "string" ? agentId : null;
  }

  private extractPreviewFromObject(value: unknown): string | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    if (
      "content" in value &&
      typeof (value as { content?: unknown }).content === "string"
    ) {
      return (value as { content: string }).content.slice(0, 120);
    }

    return JSON.stringify(value).slice(0, 120);
  }

  private extractToolName(command: string): string {
    const trimmed = command.trim();
    if (!trimmed) {
      return "tool";
    }

    const firstToken = trimmed.split(/\s+/u)[0] ?? "tool";
    const normalised = firstToken.replace(/^\/*/u, "");
    return normalised.length > 0 ? normalised : "tool";
  }

  private extractToolArguments(command: string): string | null {
    const tokens = command.trim().split(/\s+/u);
    if (tokens.length <= 1) {
      return null;
    }

    return tokens.slice(1).join(" ");
  }

  private createAgentHierarchy(
    title: string,
    sessionId: string,
    sessionMessageCount: number,
    agentInvocations: AgentInvocationSnapshot[]
  ): AgentHierarchyNodeDto[] {
    const root = new AgentHierarchyNodeDto();
    root.id = sessionId;
    root.name = title;
    root.provider = "orchestrator";
    root.model = "delegator";
    root.depth = 0;
    root.metadata = { messageCount: sessionMessageCount };

    root.children = agentInvocations.map((invocation) =>
      this.mapInvocationToHierarchyNode(invocation, 1, undefined)
    );

    return [root];
  }

  private mapInvocationToHierarchyNode(
    invocation: AgentInvocationSnapshot,
    depth: number,
    spawnDetails?: SpawnDetails
  ): AgentHierarchyNodeDto {
    const node = new AgentHierarchyNodeDto();
    node.id = invocation.id;
    node.name = spawnDetails?.name ?? invocation.id;
    node.provider = spawnDetails?.provider ?? invocation.provider;
    node.model = spawnDetails?.model ?? invocation.model;
    node.depth = depth;
    const metadata: Record<string, unknown> = {
      ...(spawnDetails?.metadata ?? {}),
      messageCount: invocation.messages.length,
    };
    node.metadata = metadata;
    const childSpawnDetails = this.extractSpawnDetails(invocation);
    node.children = invocation.children.map((child) =>
      this.mapInvocationToHierarchyNode(
        child,
        depth + 1,
        childSpawnDetails.get(child.id)
      )
    );
    return node;
  }

  private extractSpawnDetails(
    invocation: AgentInvocationSnapshot
  ): Map<string, SpawnDetails> {
    const result = new Map<string, SpawnDetails>();

    for (const message of invocation.messages) {
      if (message.role !== ChatMessageRole.Tool) {
        continue;
      }

      const payload = this.parseToolPayload(message.content);
      if (!payload.isJson) {
        continue;
      }

      const value = payload.value;
      if (!value || typeof value !== "object") {
        continue;
      }

      const schema = (value as { schema?: unknown }).schema;
      if (schema !== OrchestratorMetadataService.SPAWN_RESULT_SCHEMA) {
        continue;
      }

      const rawMetadata = (value as { metadata?: unknown }).metadata;
      if (!rawMetadata || typeof rawMetadata !== "object") {
        continue;
      }

      const metadataRecord = rawMetadata as Record<string, unknown>;
      const agentId = metadataRecord.agentId;
      if (typeof agentId !== "string") {
        continue;
      }

      const rawData = (value as { data?: unknown }).data;
      result.set(agentId, this.buildSpawnDetails(metadataRecord, rawData));
    }

    return result;
  }

  private buildSpawnDetails(
    metadataRecord: Record<string, unknown>,
    rawData: unknown
  ): SpawnDetails {
    const provider =
      typeof metadataRecord.provider === "string"
        ? metadataRecord.provider
        : undefined;
    const model =
      typeof metadataRecord.model === "string"
        ? metadataRecord.model
        : undefined;
    const name =
      typeof metadataRecord.name === "string"
        ? metadataRecord.name
        : undefined;

    const metadata: Record<string, unknown> = {};
    for (const [key, valueEntry] of Object.entries(metadataRecord)) {
      if (
        key === "agentId" ||
        key === "provider" ||
        key === "model" ||
        key === "name"
      ) {
        continue;
      }
      metadata[key] = valueEntry;
    }

    if (rawData && typeof rawData === "object" && !Array.isArray(rawData)) {
      for (const [key, dataValue] of Object.entries(
        rawData as Record<string, unknown>
      )) {
        metadata[key] = dataValue;
      }
    }

    return {
      provider,
      model,
      name,
      metadata,
    };
  }
}
