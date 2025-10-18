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
}

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

    const { agentFailed, iterationCount } = await this.runLoop.run(
      this.createRunLoopContext()
    );

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
    const historyClone = cloneHistory(child.messages);

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
