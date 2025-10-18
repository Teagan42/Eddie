import { Injectable } from "@nestjs/common";
import type {
  ExecutionAgentNode,
  ExecutionContextBundle,
  ExecutionToolInvocationNode,
  ExecutionTreeState,
  ToolCallStatus,
} from "@eddie/types";
import { ExecutionTreeStateStore } from "./execution-tree-state.store";
import {
  AgentHierarchyNodeDto,
  ContextBundleDto,
  OrchestratorMetadataDto,
  ToolCallNodeDto,
  ToolCallStatusDto,
} from "./dto/orchestrator-metadata.dto";

const TOOL_STATUS_MAP: Record<ToolCallStatus, ToolCallStatusDto> = {
  pending: ToolCallStatusDto.Pending,
  running: ToolCallStatusDto.Running,
  completed: ToolCallStatusDto.Completed,
  failed: ToolCallStatusDto.Failed,
};

@Injectable()
export class OrchestratorMetadataService {
  constructor(private readonly store: ExecutionTreeStateStore) {}

  async getMetadata(sessionId?: string): Promise<OrchestratorMetadataDto> {
    if (!sessionId) {
      return this.createEmptySnapshot();
    }

    const cached = this.store.get(sessionId);

    if (!cached) {
      return this.createEmptySnapshot(sessionId);
    }

    return this.createSnapshotFromState(sessionId, cached);
  }

  private createSnapshotFromState(
    sessionId: string,
    state: ExecutionTreeState
  ): OrchestratorMetadataDto {
    const base = this.createEmptySnapshot(
      sessionId,
      state.updatedAt ?? state.createdAt ?? new Date().toISOString()
    );

    return {
      ...base,
      agentHierarchy: this.toAgentHierarchy(state.agentHierarchy ?? []),
      toolInvocations: this.toToolInvocations(state.toolInvocations ?? []),
      contextBundles: this.toContextBundles(state.contextBundles ?? []),
    };
  }

  private createEmptySnapshot(
    sessionId?: string,
    capturedAt: string = new Date().toISOString()
  ): OrchestratorMetadataDto {
    return {
      sessionId,
      capturedAt,
      agentHierarchy: [],
      toolInvocations: [],
      contextBundles: [],
    };
  }

  private toAgentHierarchy(nodes: ExecutionAgentNode[]): AgentHierarchyNodeDto[] {
    return nodes.map((node) => ({
      id: node.id,
      name: node.name,
      provider: node.provider,
      model: node.model,
      depth: node.depth,
      ...(node.lineage?.length ? { metadata: { lineage: [...node.lineage] } } : {}),
      children: this.toAgentHierarchy(node.children ?? []),
    }));
  }

  private toToolInvocations(nodes: ExecutionToolInvocationNode[]): ToolCallNodeDto[] {
    return nodes.map((node) => ({
      id: node.id,
      name: node.name,
      status: this.toToolCallStatus(node.status),
      metadata: this.composeToolMetadata(node),
      children: this.toToolInvocations(node.children ?? []),
    }));
  }

  private composeToolMetadata(
    node: ExecutionToolInvocationNode
  ): Record<string, unknown> | undefined {
    const metadata: Record<string, unknown> = {
      ...(node.metadata ?? {}),
    };

    if (node.agentId !== undefined) {
      metadata.agentId = node.agentId;
    }

    if (node.createdAt) {
      metadata.createdAt = node.createdAt;
    }

    if (node.updatedAt) {
      metadata.updatedAt = node.updatedAt;
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private toToolCallStatus(status: ToolCallStatus): ToolCallStatusDto {
    return TOOL_STATUS_MAP[status] ?? ToolCallStatusDto.Pending;
  }

  private toContextBundles(
    bundles: ExecutionContextBundle[]
  ): ContextBundleDto[] {
    return bundles.map((bundle) => ({
      id: bundle.id,
      label: bundle.label,
      summary: bundle.summary,
      sizeBytes: bundle.sizeBytes,
      fileCount: bundle.fileCount,
      files: Array.isArray(bundle.files)
        ? bundle.files.map((file) => ({ ...file }))
        : undefined,
    }));
  }
}
