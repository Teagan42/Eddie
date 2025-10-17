import type { Logger } from "pino";

import type { StreamRendererService } from "@eddie/io";
import type { EventBus } from "@nestjs/cqrs";
import type {
  AgentLifecyclePayload,
  AgentRuntimeDescriptor,
  ChatMessage,
  ContextUpdateSourceType,
  ExecutionAgentNode,
  ExecutionContextBundle,
  ExecutionContextBundleFile,
  ExecutionContextBundlesByAgentId,
  ExecutionContextBundlesByToolCallId,
  ExecutionToolInvocationGroupsByAgentId,
  ExecutionToolInvocationNode,
  ExecutionTreeState,
  HookDispatchResult,
  HookEventMap,
  HookEventName,
  PackedContext,
  StreamEvent,
  ToolResult,
  ToolSchema,
  ToolCallStatus,
} from "@eddie/types";
import { AgentStreamEvent, ExecutionTreeStateUpdatedEvent, HOOK_EVENTS } from "@eddie/types";
import type { TemplateVariables } from "@eddie/templates";
import type { AgentInvocation } from "./agent-invocation";
import type { MetricsService } from "../telemetry/metrics.service";
import { HookBus } from '@eddie/hooks';

export interface AgentTraceEvent {
  phase: string;
  data?: Record<string, unknown>;
}

type AgentIterationPayload = AgentLifecyclePayload & {
  iteration: number;
  messages: ChatMessage[];
};

export interface AgentRunnerOptions {
  invocation: AgentInvocation;
  descriptor: AgentRuntimeDescriptor;
  streamRenderer: StreamRendererService;
  eventBus: EventBus;
  hooks: HookBus;
  logger: Logger;
  cwd: string;
  confirm: (message: string) => Promise<boolean>;
  lifecycle: AgentLifecyclePayload;
  startTraceAppend: boolean | undefined;
  composeToolSchemas: () => ToolSchema[] | undefined;
  executeSpawnTool: (
    event: Extract<StreamEvent, { type: "tool_call" }>
  ) => Promise<ToolResult>;
  applyTranscriptCompactionIfNeeded: (
    iteration: number,
    payload: AgentIterationPayload
  ) => Promise<void>;
  dispatchHookOrThrow: <E extends HookEventName>(
    event: E,
    payload: HookEventMap[E]
  ) => Promise<HookDispatchResult<E>>;
  writeTrace: (event: AgentTraceEvent, append?: boolean) => Promise<void>;
  metrics: MetricsService;
  executionTreeTracker?: ExecutionTreeStateTracker;
}

export interface SubagentRequestDetails {
  prompt: string;
  variables?: TemplateVariables;
  context?: PackedContext;
  metadata?: Record<string, unknown>;
}

export interface BuildSubagentResultOptions {
  child: AgentInvocation;
  descriptor: AgentRuntimeDescriptor;
  parentDescriptor: AgentRuntimeDescriptor;
  request: SubagentRequestDetails;
}

type PackedContextSnapshot = PackedContext & { selectedBundleIds?: string[] };

interface SpawnResultData extends Record<string, unknown> {
  agentId: string;
  messageCount: number;
  prompt: string;
  finalMessage?: string;
  variables?: TemplateVariables;
  context: PackedContextSnapshot;
  requestContext?: PackedContextSnapshot;
  /**
   * Full transcript of the child invocation, including system, user, and assistant
   * messages in the order they were produced.
   */
  history?: ChatMessage[];
  transcriptSummary?: string;
  historySnippet?: string;
}

type ToolCallStreamEvent = Extract<StreamEvent, { type: "tool_call" }>;
type ToolResultStreamEvent = Extract<StreamEvent, { type: "tool_result" }>;

export interface ExecutionTreeTrackerOptions {
  sessionId?: string;
  eventBus: EventBus;
  now?: () => Date;
}

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

export class ExecutionTreeStateTracker {
  private readonly now: () => Date;
  private readonly state: ExecutionTreeState;
  private readonly agents = new Map<string, ExecutionAgentNode>();
  private readonly toolInvocationsById = new Map<string, ExecutionToolInvocationNode>();
  private toolCallCounter = 0;

  constructor(private readonly options: ExecutionTreeTrackerOptions) {
    this.now = options.now ?? (() => new Date());
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
    const { sessionId, eventBus } = this.options;
    if (!sessionId) {
      return;
    }
    const snapshot = this.cloneState(this.state);
    eventBus.publish(new ExecutionTreeStateUpdatedEvent(sessionId, snapshot));
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

export class AgentRunner {
  static readonly SPAWN_TOOL_NAME = "spawn_subagent";
  static readonly SPAWN_TOOL_RESULT_SCHEMA = "eddie.tool.spawn_subagent.result.v1";

  private previousResponseId: string | undefined;
  private subagentStopEmitted = false;

  constructor(private readonly options: AgentRunnerOptions) {}

  async run(): Promise<void> {
    const {
      invocation,
      descriptor,
      streamRenderer,
      eventBus,
      hooks,
      logger,
      composeToolSchemas,
      executeSpawnTool,
      applyTranscriptCompactionIfNeeded,
      dispatchHookOrThrow,
      writeTrace,
      lifecycle,
      startTraceAppend,
      confirm,
      cwd,
      metrics,
      executionTreeTracker,
    } = this.options;

    if (!invocation.isRoot) {
      streamRenderer.flush();
    }

    await hooks.emitAsync(HOOK_EVENTS.beforeAgentStart, lifecycle);

    executionTreeTracker?.registerAgent({
      agentId: invocation.id,
      parentId: invocation.parent?.id,
      descriptor,
    });

    await writeTrace(
      {
        phase: "agent_start",
        data: {
          prompt: invocation.prompt,
          systemPrompt: invocation.definition.systemPrompt,
          model: descriptor.model,
          provider: descriptor.provider.name,
        },
      },
      startTraceAppend
    );

    let iteration = 0;
    let agentFailed = false;
    let continueConversation = true;

    try {
      while (continueConversation) {
        iteration += 1;
        continueConversation = false;

        const iterationPayload = this.createIterationPayload(iteration);

        await metrics.timeOperation(
          "transcript.compaction",
          () => applyTranscriptCompactionIfNeeded(iteration, iterationPayload)
        );

        await hooks.emitAsync(HOOK_EVENTS.beforeModelCall, iterationPayload);
        await writeTrace({
          phase: "model_call",
          data: {
            iteration,
            messageCount: invocation.messages.length,
            model: descriptor.model,
            provider: descriptor.provider.name,
          },
        });

        const toolSchemas = composeToolSchemas();

        const publishWithAgent = (incoming: StreamEvent): void => {
          eventBus.publish(
            new AgentStreamEvent({ ...incoming, agentId: invocation.id })
          );
        };

        const stream = descriptor.provider.stream({
          model: descriptor.model,
          messages: invocation.messages,
          tools: toolSchemas,
          ...(this.previousResponseId ? { previousResponseId: this.previousResponseId } : {}),
        });

        let assistantBuffer = "";

        for await (const event of stream) {
          if (event.type === "delta") {
            assistantBuffer += event.text;
            publishWithAgent(event);
            continue;
          }

          if (event.type === "tool_call") {
            streamRenderer.flush();
            publishWithAgent(event);

            executionTreeTracker?.recordToolCall(invocation.id, event);

            const preToolDispatch = await dispatchHookOrThrow(
              HOOK_EVENTS.preToolUse,
              {
                ...iterationPayload,
                event,
              }
            );

            await writeTrace({
              phase: "tool_call",
              data: {
                iteration,
                id: event.id,
                name: event.name,
                arguments: event.arguments,
              },
            });

            invocation.messages.push({
              role: "assistant",
              content: "",
              name: event.name,
              tool_call_id: event.id,
            });
            metrics.countMessage("assistant");

            const blockSignal = preToolDispatch.blocked;

            if (blockSignal) {
              const reason =
                blockSignal.reason ?? "Tool execution blocked by hook.";

              invocation.messages.push({
                role: "tool",
                name: event.name,
                tool_call_id: event.id,
                content: reason,
              });

              logger.warn(
                {
                  tool: event.name,
                  agent: invocation.id,
                  reason,
                },
                "Tool execution vetoed by hook"
              );

              metrics.observeToolCall({
                name: event.name,
                status: "blocked",
              });

              continueConversation = true;
              continue;
            }

            try {
              let result: ToolResult;
              if (event.name === AgentRunner.SPAWN_TOOL_NAME) {
                result = await executeSpawnTool(event);
              } else {
                result = await invocation.toolRegistry.execute(event, {
                  cwd,
                  confirm,
                  env: process.env,
                });
              }

              publishWithAgent({
                type: "tool_result",
                name: event.name,
                id: event.id,
                result,
              });

              executionTreeTracker?.recordToolResult(
                invocation.id,
                { type: "tool_result", id: event.id, name: event.name, result },
                result
              );

              const messagePayload: Record<string, unknown> = {
                schema: result.schema,
                content: result.content,
              };

              if (result.data !== undefined) {
                messagePayload.data = result.data;
              }

              if (result.metadata !== undefined) {
                messagePayload.metadata = result.metadata;
              }

              invocation.messages.push({
                role: "tool",
                name: event.name,
                tool_call_id: event.id,
                content: JSON.stringify(messagePayload),
              });

              await dispatchHookOrThrow(HOOK_EVENTS.postToolUse, {
                ...iterationPayload,
                event,
                result,
              });

              await writeTrace({
                phase: "tool_result",
                data: {
                  iteration,
                  id: event.id,
                  name: event.name,
                  result,
                },
              });

              metrics.observeToolCall({
                name: event.name,
                status: "success",
              });

              continueConversation = true;
            } catch (error) {
              const serialized = AgentRunner.serializeError(error);
              const message = `Tool execution failed: ${ serialized.message }`;
              const notification: Extract<StreamEvent, { type: "notification" }> = {
                type: "notification",
                payload: message,
                metadata: {
                  tool: event.name,
                  tool_call_id: event.id,
                  severity: "error",
                },
              };

              logger.warn(
                { err: serialized.message, tool: event.name, agent: invocation.id },
                "Tool execution failed"
              );

              publishWithAgent(notification);

              invocation.messages.push({
                role: "tool",
                name: event.name,
                tool_call_id: event.id,
                content: message,
              });

              await hooks.emitAsync(HOOK_EVENTS.notification, {
                ...iterationPayload,
                event: notification,
              });

              await writeTrace({
                phase: "tool_error",
                data: {
                  iteration,
                  id: event.id,
                  name: event.name,
                  error: serialized,
                },
              });

              executionTreeTracker?.recordToolError(invocation.id, event, serialized);

              metrics.observeToolCall({
                name: event.name,
                status: "error",
              });
              metrics.countError("tool.execution");

              continueConversation = true;
              continue;
            }

            continue;
          }

          if (event.type === "error") {
            publishWithAgent(event);
            agentFailed = true;

            metrics.countError("agent.stream");

            const { message, cause } = event;

            await dispatchHookOrThrow(HOOK_EVENTS.onError, {
              ...lifecycle,
              iteration,
              error: event,
            });
            await dispatchHookOrThrow(HOOK_EVENTS.onAgentError, {
              ...lifecycle,
              error: {
                message,
                cause,
              },
            });
            await writeTrace({
              phase: "agent_error",
              data: {
                iteration,
                message,
                cause,
              },
            });

            break;
          }

          if (event.type === "notification") {
            publishWithAgent(event);
            await hooks.emitAsync(HOOK_EVENTS.notification, {
              ...iterationPayload,
              event,
            });
            continue;
          }

          if (event.type === "end") {
            publishWithAgent(event);
            if (event.responseId) {
              this.previousResponseId = event.responseId;
            }
            if (assistantBuffer.trim().length > 0) {
              invocation.messages.push({
                role: "assistant",
                content: assistantBuffer,
              });
              metrics.countMessage("assistant");
            }

            await hooks.emitAsync(HOOK_EVENTS.stop, {
              ...iterationPayload,
              messages: invocation.messages,
            });
            await writeTrace({
              phase: "iteration_complete",
              data: {
                iteration,
                messageCount: invocation.messages.length,
                finalMessage: invocation.messages.at(-1)?.content,
              },
            });

            continue;
          }

          publishWithAgent(event);
        }

        if (agentFailed) {
          break;
        }
      }
    } catch (error) {
      agentFailed = true;
      const serialized = AgentRunner.serializeError(error);
      await dispatchHookOrThrow(HOOK_EVENTS.onAgentError, {
        ...lifecycle,
        error: serialized,
      });
      await writeTrace({
        phase: "agent_error",
        data: serialized,
      });
      metrics.countError("agent.run");
      await this.emitSubagentStop();
      throw error;
    }

    if (agentFailed) {
      await this.emitSubagentStop();
      return;
    }

    await hooks.emitAsync(HOOK_EVENTS.afterAgentComplete, {
      ...lifecycle,
      iterations: iteration,
      messages: invocation.messages,
    });
    await writeTrace({
      phase: "agent_complete",
      data: {
        iterations: iteration,
        messageCount: invocation.messages.length,
        finalMessage: invocation.messages.at(-1)?.content,
      },
    });

    await this.emitSubagentStop();
    executionTreeTracker?.recordAgentCompletion(invocation.id);
  }

  static buildSubagentResult(
    options: BuildSubagentResultOptions
  ): ToolResult<SpawnResultData> {
    const { child, descriptor, parentDescriptor, request } = options;
    const finalMessage = child.messages.at(-1);
    const finalMessageText = finalMessage?.content?.trim() ?? "";
    const transcriptSummary = AgentRunner.createTranscriptSummary(child.messages);
    const { clone: contextClone, bundleIds: selectedBundleIds } =
      AgentRunner.createContextSnapshot(child.context);
    const requestSnapshot = request.context
      ? AgentRunner.createContextSnapshot(request.context)
      : undefined;
    const requestContextClone = requestSnapshot?.clone;
    const historyClone = AgentRunner.cloneHistory(child.messages);

    const variablesClone = request.variables && Object.keys(request.variables).length > 0
      ? { ...request.variables }
      : undefined;

    const content = finalMessageText.length > 0
      ? finalMessageText
      : `Subagent ${ descriptor.id } completed without a final response.`;

    const metadata: Record<string, unknown> = {
      agentId: descriptor.id,
      model: descriptor.model,
      provider: descriptor.provider.name,
      parentAgentId: parentDescriptor.id,
    };

    if (descriptor.metadata?.profileId) {
      metadata.profileId = descriptor.metadata.profileId;
    }
    if (descriptor.metadata?.routingThreshold !== undefined) {
      metadata.routingThreshold = descriptor.metadata.routingThreshold;
    }
    if (descriptor.metadata?.name) {
      metadata.name = descriptor.metadata.name;
    }
    if (descriptor.metadata?.description) {
      metadata.description = descriptor.metadata.description;
    }
    if (request.metadata && Object.keys(request.metadata).length > 0) {
      metadata.request = { ...request.metadata };
    }

    if (selectedBundleIds.length > 0) {
      metadata.contextBundleIds = selectedBundleIds;
    }

    if (transcriptSummary) {
      metadata.historySnippet = transcriptSummary;
      metadata.transcriptSummary = transcriptSummary;
    }

    if (finalMessageText.length > 0) {
      metadata.finalMessage = finalMessageText;
    }

    const data: SpawnResultData = {
      agentId: descriptor.id,
      messageCount: child.messages.length,
      prompt: request.prompt,
      context: contextClone,
    };

    if (variablesClone) {
      data.variables = variablesClone;
    }

    if (finalMessageText.length > 0) {
      data.finalMessage = finalMessageText;
    }

    if (transcriptSummary) {
      data.transcriptSummary = transcriptSummary;
      data.historySnippet = transcriptSummary;
    }

    if (historyClone.length > 0) {
      data.history = historyClone;
    }

    if (requestContextClone) {
      data.requestContext = requestContextClone;
    }

    return {
      schema: AgentRunner.SPAWN_TOOL_RESULT_SCHEMA,
      content,
      data,
      metadata,
    };
  }

  private static cloneContext(context: PackedContext): PackedContextSnapshot {
    return {
      ...context,
      files: context.files.map((file) => ({ ...file })),
      resources: context.resources?.map((resource) => ({
        ...resource,
        files: resource.files?.map((file) => ({ ...file })),
      })),
    };
  }

  private static createContextSnapshot(context: PackedContext): {
    clone: PackedContextSnapshot;
    bundleIds: string[];
  } {
    const clone = AgentRunner.cloneContext(context);
    const bundleIds = AgentRunner.collectSelectedBundleIds(context);
    if (bundleIds.length > 0) {
      clone.selectedBundleIds = bundleIds;
    }
    return { clone, bundleIds };
  }

  private static cloneHistory(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((message) => ({ ...message }));
  }

  private static collectSelectedBundleIds(context: PackedContext): string[] {
    if (!context.resources || context.resources.length === 0) {
      return [];
    }

    return context.resources
      .filter((resource) => resource.type === "bundle")
      .map((resource) => resource.id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  }

  private static createTranscriptSummary(messages: ChatMessage[]): string | undefined {
    const relevant = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => {
        const trimmed = message.content.trim();
        if (!trimmed) {
          return undefined;
        }

        const role = message.role === "user" ? "User" : "Assistant";
        return `${ role }: ${ trimmed }`;
      })
      .filter((value): value is string => Boolean(value));

    if (relevant.length === 0) {
      return undefined;
    }

    const snippet = relevant.slice(-2).join(" | ");
    return snippet.length > 280 ? `${ snippet.slice(0, 277) }...` : snippet;
  }

  private async emitSubagentStop(): Promise<void> {
    const { invocation, hooks, lifecycle } = this.options;
    if (invocation.isRoot || this.subagentStopEmitted) {
      return;
    }

    this.subagentStopEmitted = true;
    await hooks.emitAsync(HOOK_EVENTS.subagentStop, lifecycle);
  }

  private createIterationPayload(
    iteration: number
  ): AgentIterationPayload {
    const { lifecycle, invocation } = this.options;
    return {
      ...lifecycle,
      iteration,
      messages: invocation.messages,
    };
  }

  private static serializeError(error: unknown): {
    message: string;
    stack?: string;
    cause?: unknown;
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        cause: (error as { cause?: unknown }).cause,
      };
    }

    return { message: String(error) };
  }
}
