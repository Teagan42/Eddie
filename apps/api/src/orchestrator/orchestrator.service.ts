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
    messages: ReturnType<ChatSessionsService["listMessages"]>
  ): AgentHierarchyNodeDto[] {
    const root = new AgentHierarchyNodeDto();
    root.id = sessionId;
    root.name = title;
    root.provider = "orchestrator";
    root.model = "delegator";
    root.depth = 0;
    root.metadata = { messageCount: messages.length };

    root.children = messages
      .filter((message) => message.role === "assistant")
      .map((message, index) => {
        const node = new AgentHierarchyNodeDto();
        node.id = `${sessionId}-agent-${index}`;
        node.name = `Responder ${index + 1}`;
        node.provider = "assistant";
        node.model = "runtime";
        node.depth = 1;
        node.metadata = {
          createdAt: message.createdAt,
        };
        node.children = [];
        return node;
      });

    return [root];
  }
}
