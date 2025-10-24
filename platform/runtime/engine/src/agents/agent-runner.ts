import type { Logger } from "pino";

import type { StreamRendererService } from "@eddie/io";
import type { EventBus } from "@nestjs/cqrs";
import type {
  AgentLifecyclePayload,
  AgentRuntimeDescriptor,
  ChatMessage,
  HookDispatchResult,
  HookEventMap,
  HookEventName,
  PackedContext,
  StreamEvent,
  ToolResult,
  ToolSchema,
} from "@eddie/types";
import { HOOK_EVENTS } from "@eddie/types";
import type { TemplateVariables } from "@eddie/templates";
import type { AgentInvocation } from "./agent-invocation";
import type { MetricsService } from "../telemetry/metrics.service";
import { HookBus } from "@eddie/hooks";
import {
  AgentRunLoop,
  type AgentRunLoopContext,
  cloneHistory,
  createContextSnapshot,
  createTranscriptSummary,
  serializeError,
  ToolCallHandler,
  TraceWriterDelegate,
  type PackedContextSnapshot,
} from "./runner";
import { ExecutionTreeStateTracker } from "../execution-tree/execution-tree-tracker.service";
import type { AgentMemoryBinding } from "../memory/agent-memory-coordinator";

export interface AgentTraceEvent {
  phase: string;
  data?: Record<string, unknown>;
}

export type AgentIterationPayload = AgentLifecyclePayload & {
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
  memoryBinding?: AgentMemoryBinding;
}

export interface AgentRunnerDependencies {
  runLoop?: AgentRunLoop;
  toolCallHandler?: ToolCallHandler;
  traceWriterDelegate?: TraceWriterDelegate;
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
  fullHistory?: ChatMessage[];
}

interface SpawnResultData extends Record<string, unknown> {
  agentId: string;
  messageCount: number;
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

export class AgentRunner {
  static readonly SPAWN_TOOL_NAME = "spawn_subagent";
  static readonly SPAWN_TOOL_RESULT_SCHEMA = "eddie.tool.spawn_subagent.result.v1";

  private previousResponseId: string | undefined;
  private subagentStopEmitted = false;

  private readonly traceWriter: TraceWriterDelegate;
  private readonly toolCallHandler: ToolCallHandler;
  private readonly runLoop: AgentRunLoop;

  constructor(
    private readonly options: AgentRunnerOptions,
    dependencies: AgentRunnerDependencies = {}
  ) {
    this.traceWriter =
      dependencies.traceWriterDelegate ?? new TraceWriterDelegate();
    this.toolCallHandler =
      dependencies.toolCallHandler ??
      new ToolCallHandler(this.traceWriter);
    this.runLoop =
      dependencies.runLoop ??
      new AgentRunLoop(this.toolCallHandler, this.traceWriter);
  }

  async run(): Promise<void> {
    const {
      invocation,
      descriptor,
      streamRenderer,
      hooks,
      lifecycle,
      writeTrace,
      startTraceAppend,
      executionTreeTracker,
    } = this.options;
    const memoryBinding = this.options.memoryBinding;
    const initialMessageCount = invocation.messages.length;
    let agentFailed = false;
    let iterationCount = 0;

    if (!invocation.isRoot) {
      streamRenderer.flush();
    }

    await hooks.emitAsync(HOOK_EVENTS.beforeAgentStart, lifecycle);

    executionTreeTracker?.registerAgent({
      agentId: invocation.id,
      parentId: invocation.parent?.id,
      descriptor,
    });

    await this.traceWriter.write({
      writeTrace,
      append: startTraceAppend,
      event: {
        phase: "agent_start",
        data: {
          prompt: invocation.prompt,
          systemPrompt: invocation.definition.systemPrompt,
          model: descriptor.model,
          provider: descriptor.provider.name,
        },
      },
    });

    try {
      const result = await this.runLoop.run(this.createRunLoopContext());
      agentFailed = result.agentFailed;
      iterationCount = result.iterationCount;

      if (agentFailed) {
        await this.emitSubagentStop();
        return;
      }

      await hooks.emitAsync(HOOK_EVENTS.afterAgentComplete, {
        ...lifecycle,
        iterations: iterationCount,
        messages: invocation.messages,
      });
      await this.traceWriter.write({
        writeTrace,
        event: {
          phase: "agent_complete",
          data: {
            iterations: iterationCount,
            messageCount: invocation.messages.length,
            finalMessage: invocation.messages.at(-1)?.content,
          },
        },
      });

      await this.emitSubagentStop();
      executionTreeTracker?.recordAgentCompletion(invocation.id);
    } catch (error) {
      agentFailed = true;
      throw error;
    } finally {
      if (memoryBinding) {
        const newMessages = invocation.messages.slice(initialMessageCount);
        await memoryBinding.finalize({
          invocation,
          descriptor,
          newMessages,
          failed: agentFailed,
        });
      }
    }
  }

  private createRunLoopContext(): AgentRunLoopContext {
    return {
      options: this.options,
      createIterationPayload: (iteration) =>
        this.createIterationPayload(iteration),
      getPreviousResponseId: () => this.previousResponseId,
      setPreviousResponseId: (value) => {
        this.previousResponseId = value;
      },
      emitSubagentStop: () => this.emitSubagentStop(),
      serializeError,
      spawnToolName: AgentRunner.SPAWN_TOOL_NAME,
    };
  }

  static buildSubagentResult(
    options: BuildSubagentResultOptions
  ): ToolResult<SpawnResultData> {
    const { child, descriptor, parentDescriptor, request } = options;
    const finalMessage = child.messages.at(-1);
    const finalMessageText = finalMessage?.content?.trim() ?? "";
    const transcriptSummary = createTranscriptSummary(child.messages);
    const { clone: contextClone, bundleIds: selectedBundleIds } =
      createContextSnapshot(child.context);
    const requestSnapshot = request.context
      ? createContextSnapshot(request.context)
      : undefined;
    const requestContextClone = requestSnapshot?.clone;
    const historySource = options.fullHistory ?? child.messages;
    const historyClone = cloneHistory(historySource);

    const variablesClone = request.variables && Object.keys(request.variables).length > 0
      ? { ...request.variables }
      : undefined;

    const content = finalMessageText.length > 0
      ? finalMessageText
      : `Subagent ${ descriptor.id } completed without a final response.`;

    const metadataRequest =
      request.metadata && Object.keys(request.metadata).length > 0
        ? { ...request.metadata }
        : {};

    const metadata: Record<string, unknown> = {
      agentId: descriptor.id,
      model: descriptor.model,
      provider: descriptor.provider.name,
      parentAgentId: parentDescriptor.id,
      ...(descriptor.metadata?.profileId
        ? { profileId: descriptor.metadata.profileId }
        : {}),
      ...(descriptor.metadata?.routingThreshold !== undefined
        ? { routingThreshold: descriptor.metadata.routingThreshold }
        : {}),
      ...(descriptor.metadata?.name ? { name: descriptor.metadata.name } : {}),
      ...(descriptor.metadata?.description
        ? { description: descriptor.metadata.description }
        : {}),
      request: metadataRequest,
      ...(selectedBundleIds.length > 0
        ? { contextBundleIds: selectedBundleIds }
        : {}),
      ...(transcriptSummary
        ? { historySnippet: transcriptSummary, transcriptSummary }
        : {}),
      ...(finalMessageText.length > 0
        ? { finalMessage: finalMessageText }
        : {}),
    };

    const data: SpawnResultData = {
      agentId: descriptor.id,
      messageCount: historySource.length,
      context: contextClone,
      ...(variablesClone ? { variables: variablesClone } : {}),
      ...(finalMessageText.length > 0
        ? { finalMessage: finalMessageText }
        : {}),
      ...(transcriptSummary
        ? { transcriptSummary, historySnippet: transcriptSummary }
        : {}),
      ...(historyClone.length > 0 ? { history: historyClone } : {}),
      ...(requestContextClone ? { requestContext: requestContextClone } : {}),
    };

    return {
      schema: AgentRunner.SPAWN_TOOL_RESULT_SCHEMA,
      content,
      data,
      metadata,
    };
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

}
