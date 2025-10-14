import { Injectable } from "@nestjs/common";
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

const SPAWN_TOOL_RESULT_SCHEMA = "eddie.tool.spawn_subagent.result.v1";

interface SpawnResultDetails {
  agentId: string;
  provider?: string;
  model?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class OrchestratorMetadataService {
  constructor(private readonly chatSessions: ChatSessionsService) {}

  getMetadata(sessionId?: string): OrchestratorMetadataDto {
    if (!sessionId) {
      return this.createEmptySnapshot();
    }

    const session = this.chatSessions.getSession(sessionId);
    const messages = this.chatSessions.listMessages(sessionId);
    const agentInvocations = this.chatSessions.listAgentInvocations(sessionId);

    const contextBundles = this.createContextBundles(sessionId, messages.length);
    const toolInvocations =
      agentInvocations.length > 0
        ? this.createToolInvocationsFromAgents(agentInvocations)
        : this.createToolInvocationsFromMessages(sessionId, messages);
    const agentHierarchy = this.createAgentHierarchy(
      session.title,
      sessionId,
      messages,
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
      },
    ];
  }

  private createToolInvocationsFromMessages(
    sessionId: string,
    messages: ReturnType<ChatSessionsService["listMessages"]>
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
        node.metadata = {
          ...(node.metadata ?? {}),
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
        existing.metadata = {
          ...(existing.metadata ?? {}),
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
      node.metadata = {
        preview: payload.preview,
        ...(payload.isJson
          ? { payload: payload.value }
          : { command: message.content }),
        ...(toolCallId ? { toolCallId } : {}),
        ...(resolvedToolName ? { toolName: resolvedToolName } : {}),
      };
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
    messages: ReturnType<ChatSessionsService["listMessages"]>,
    agents: AgentInvocationSnapshot[]
  ): AgentHierarchyNodeDto[] {
    const root = new AgentHierarchyNodeDto();
    root.id = sessionId;
    root.name = title;
    root.provider = "orchestrator";
    root.model = "delegator";
    root.depth = 0;
    root.metadata = { messageCount: messages.length };

    root.children = agents.map((agent) =>
      this.createAgentHierarchyNode(agent, 1, undefined)
    );

    return [root];
  }

  private createAgentHierarchyNode(
    agent: AgentInvocationSnapshot,
    depth: number,
    spawnDetails: SpawnResultDetails | undefined
  ): AgentHierarchyNodeDto {
    const node = new AgentHierarchyNodeDto();
    node.id = agent.id;
    node.name = spawnDetails?.name ?? this.formatAgentName(agent.id);
    if (spawnDetails?.provider) {
      node.provider = spawnDetails.provider;
    }
    if (spawnDetails?.model) {
      node.model = spawnDetails.model;
    }
    node.depth = depth;

    node.metadata = this.buildAgentMetadata(
      agent.messages.length,
      spawnDetails?.metadata
    );

    const childSpawnMetadata = this.extractChildSpawnMetadata(agent.messages);
    node.children = agent.children.map((child) =>
      this.createAgentHierarchyNode(
        child,
        depth + 1,
        childSpawnMetadata.get(child.id)
      )
    );

    return node;
  }

  private extractChildSpawnMetadata(
    messages: AgentInvocationSnapshot["messages"]
  ): Map<string, SpawnResultDetails> {
    const results = new Map<string, SpawnResultDetails>();

    for (const message of messages) {
      if (message.role !== ChatMessageRole.Tool) {
        continue;
      }

      const payload = this.parseToolPayload(message.content);
      if (!payload.isJson) {
        continue;
      }

      const details = this.extractSpawnResultDetails(payload.value);
      if (details) {
        results.set(details.agentId, details);
      }
    }

    return results;
  }

  private extractSpawnResultDetails(value: unknown): SpawnResultDetails | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const schema = (value as { schema?: unknown }).schema;
    if (schema !== SPAWN_TOOL_RESULT_SCHEMA) {
      return null;
    }

    const metadata = (value as { metadata?: unknown }).metadata;
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    const record = metadata as Record<string, unknown>;
    const agentId = typeof record.agentId === "string" ? record.agentId : null;
    if (!agentId) {
      return null;
    }

    const provider = this.extractStringField(record, ["providerId", "provider"]);
    const model = this.extractStringField(record, ["modelId", "model"]);
    const name = this.extractStringField(record, ["agentName", "name", "label"]);

    const contextBundleIds = Array.isArray(record.contextBundleIds)
      ? record.contextBundleIds.filter((id): id is string => typeof id === "string")
      : undefined;

    const metadataFields: Record<string, unknown> = {};
    if (contextBundleIds && contextBundleIds.length > 0) {
      metadataFields.contextBundleIds = contextBundleIds;
    }

    const content = (value as { content?: unknown }).content;
    if (typeof content === "string" && content.trim().length > 0) {
      metadataFields.spawnMessage = content;
    }

    return {
      agentId,
      provider,
      model,
      name,
      metadata: Object.keys(metadataFields).length > 0 ? metadataFields : undefined,
    };
  }

  private extractStringField(
    source: Record<string, unknown>,
    keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
    return undefined;
  }

  private formatAgentName(agentId: string): string {
    if (!agentId) {
      return "agent";
    }

    const [first, ...rest] = agentId.split(/[-_\s]+/u);
    const capitalise = (part: string) =>
      part.length > 0 ? part[0]?.toUpperCase() + part.slice(1) : part;

    const segments = [first, ...rest]
      .filter((segment): segment is string => typeof segment === "string" && segment.length > 0)
      .map((segment) => capitalise(segment));

    return segments.length > 0 ? segments.join(" ") : agentId;
  }

  private buildAgentMetadata(
    messageCount: number,
    spawnMetadata?: Record<string, unknown>
  ): Record<string, unknown> {
    if (!spawnMetadata || Object.keys(spawnMetadata).length === 0) {
      return { messageCount };
    }

    return { messageCount, ...spawnMetadata };
  }
}
