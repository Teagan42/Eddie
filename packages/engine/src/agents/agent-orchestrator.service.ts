import { Injectable } from "@nestjs/common";
import type { Logger } from "pino";
import { JsonlWriterService, StreamRendererService } from "@eddie/io";
import { HOOK_EVENTS, isSpawnSubagentOverride } from "@eddie/hooks";
import type { HookBus } from "@eddie/hooks";
import type {
  AgentLifecyclePayload,
  AgentMetadata,
  AgentTranscriptCompactionPayload,
  HookDispatchResult,
  HookEventMap,
  HookEventName,
  SpawnSubagentDelegateOptions,
  SpawnSubagentDelegateResult,
  SpawnSubagentHookPayload,
  SpawnSubagentTargetSummary,
} from "@eddie/hooks";
import type {
  PackedContext,
  StreamEvent,
  ToolResult,
  ToolSchema,
} from "@eddie/types";
import type { AgentDefinition } from "./agent-definition";
import {
  AgentInvocation,
  type AgentInvocationOptions,
  type AgentSpawnHandler,
} from "./agent-invocation";
import { AgentInvocationFactory } from "./agent-invocation.factory";
import type { AgentRuntimeCatalog, AgentRuntimeDescriptor } from "./agent-runtime.types";
import { AgentRunner, type AgentTraceEvent } from "./agent-runner";
import type { TemplateVariables } from "@eddie/templates";
import type { TranscriptCompactorSelector } from "../transcript-compactors/types";
export type {
  TranscriptCompactionPlan,
  TranscriptCompactionResult,
  TranscriptCompactor,
  TranscriptCompactorSelector,
} from "../transcript-compactors/types";

interface SpawnToolArguments {
    agent: string;
    prompt: string;
    variables?: TemplateVariables;
    metadata?: Record<string, unknown>;
}

export interface AgentRuntimeOptions {
    catalog: AgentRuntimeCatalog;
    hooks: HookBus;
    confirm: (message: string) => Promise<boolean>;
    cwd: string;
    logger: Logger;
    tracePath?: string;
    sessionId?: string;
    traceAppend?: boolean;
    transcriptCompactor?: TranscriptCompactorSelector;
}

export interface AgentRunRequest extends AgentInvocationOptions {
    definition: AgentDefinition;
    parent?: AgentInvocation;
}

@Injectable()
export class AgentOrchestratorService {
  private readonly runtimeMap = new WeakMap<AgentInvocation, AgentRuntimeOptions>();
  private readonly descriptorMap = new WeakMap<
        AgentInvocation,
        AgentRuntimeDescriptor
    >();

  constructor(
        private readonly agentInvocationFactory: AgentInvocationFactory,
        private streamRenderer: StreamRendererService,
        private readonly traceWriter: JsonlWriterService
  ) { }

  setStreamRenderer(streamRenderer: StreamRendererService): void {
    this.streamRenderer = streamRenderer;
  }

  async runAgent(
    request: AgentRunRequest,
    runtime: AgentRuntimeOptions
  ): Promise<AgentInvocation> {
    this.attachHookAgentRunner(runtime);

    const invocation = await this.agentInvocationFactory.create(
      request.definition,
      {
        prompt: request.prompt,
        context: request.context,
        history: request.history,
      },
      request.parent
    );

    const spawnHandler: AgentSpawnHandler = async (definition, options) =>
      this.spawnSubAgent(invocation, definition, options);
    invocation.setSpawnHandler(spawnHandler);

    if (request.parent) {
      request.parent.addChild(invocation);
    }

    this.runtimeMap.set(invocation, runtime);
    this.registerInvocation(invocation, runtime);
    await this.executeInvocation(invocation);
    return invocation;
  }

  async spawnSubAgent(
    parent: AgentInvocation,
    definition: AgentDefinition,
    options: AgentInvocationOptions
  ): Promise<AgentInvocation> {
    const runtime = this.runtimeMap.get(parent);
    if (!runtime) {
      throw new Error(
        `Unable to spawn subagent for ${ parent.id }; runtime context missing.`
      );
    }

    const invocation = await this.agentInvocationFactory.create(
      definition,
      options,
      parent
    );

    const spawnHandler: AgentSpawnHandler = async (childDefinition, childOptions) =>
      this.spawnSubAgent(invocation, childDefinition, childOptions);
    invocation.setSpawnHandler(spawnHandler);

    parent.addChild(invocation);
    this.runtimeMap.set(invocation, runtime);
    this.registerInvocation(invocation, runtime);
    await this.executeInvocation(invocation);
    return invocation;
  }

  collectInvocations(root: AgentInvocation): AgentInvocation[] {
    const queue: AgentInvocation[] = [ root ];
    const result: AgentInvocation[] = [];

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      result.push(current);
      const { children } = current;
      if (children.length > 0) {
        queue.push(...children);
      }
    }

    return result;
  }

  private attachHookAgentRunner(runtime: AgentRuntimeOptions): void {
    const hookBus = runtime.hooks;
    if (typeof hookBus?.setAgentRunner !== "function") {
      return;
    }

    if (hookBus.hasAgentRunner?.()) {
      return;
    }

    hookBus.setAgentRunner(async (options) => {
      if (!runtime.catalog.enableSubagents) {
        throw new Error("Subagent delegation is disabled for this run.");
      }

      const descriptor = runtime.catalog.getAgent(options.agentId);
      if (!descriptor) {
        throw new Error(
          `Hook attempted to run unknown agent "${ options.agentId }".`
        );
      }

      const invocation = await this.runAgent(
        {
          definition: descriptor.definition,
          prompt: options.prompt,
          context: options.context,
          variables: options.variables,
        },
        runtime
      );

      return {
        prompt: invocation.prompt,
        messages: invocation.messages,
        target: this.toTargetSummary(descriptor),
      };
    });
  }

  private registerInvocation(
    invocation: AgentInvocation,
    runtime: AgentRuntimeOptions
  ): AgentRuntimeDescriptor {
    const descriptor = runtime.catalog.getAgent(invocation.definition.id);
    if (!descriptor) {
      throw new Error(
        `No runtime descriptor registered for agent ${ invocation.definition.id }`
      );
    }

    this.descriptorMap.set(invocation, descriptor);
    return descriptor;
  }

  private getInvocationDescriptor(
    invocation: AgentInvocation
  ): AgentRuntimeDescriptor {
    const descriptor = this.descriptorMap.get(invocation);
    if (!descriptor) {
      throw new Error(
        `No runtime descriptor registered for agent ${ invocation.definition.id }`
      );
    }

    return descriptor;
  }

  private composeToolSchemas(
    invocation: AgentInvocation,
    runtime: AgentRuntimeOptions
  ): ToolSchema[] | undefined {
    const schemas = invocation.toolRegistry.schemas();
    const additional: ToolSchema[] = [];

    const spawnSchema = this.createSpawnToolSchema(runtime);
    if (spawnSchema) {
      additional.push(spawnSchema);
    }

    if (schemas.length === 0 && additional.length === 0) {
      return undefined;
    }

    return [ ...schemas, ...additional ];
  }

  private createSpawnToolSchema(
    runtime: AgentRuntimeOptions
  ): ToolSchema | undefined {
    if (!runtime.catalog.enableSubagents) {
      return undefined;
    }

    const subagents = runtime.catalog.listSubagents();
    if (subagents.length === 0) {
      return undefined;
    }

    const lines = subagents.map((agent) => {
      const nameLabel =
        agent.metadata?.name && agent.metadata.name !== agent.id
          ? `${agent.id} (${agent.metadata.name})`
          : agent.id;
      const description = agent.metadata?.description
        ? ` – ${ agent.metadata.description }`
        : "";
      return `- ${ nameLabel }${ description }`;
    });

    const description = [
      "Spawn a configured subagent to handle part of the request.",
      lines.length ? `Available subagents:\n${ lines.join("\n") }` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      type: "function",
      name: AgentRunner.SPAWN_TOOL_NAME,
      description,
      parameters: {
        type: "object",
        required: [ "agent", "prompt" ],
        additionalProperties: false,
        properties: {
          agent: {
            type: "string",
            description: "Identifier of the configured subagent to launch.",
          },
          prompt: {
            type: "string",
            description: "Instructions to send to the delegated subagent.",
          },
          variables: {
            type: "object",
            description:
              "Optional template variables merged into the subagent's prompt context.",
            additionalProperties: true,
          },
          metadata: {
            type: "object",
            description:
              "Optional metadata describing the delegation request for auditing.",
            additionalProperties: true,
          },
        },
      },
    };
  }

  private coerceToolArguments(raw: unknown): Record<string, unknown> {
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (this.isPlainObject(parsed)) {
          return parsed;
        }
      } catch {
        return { input: raw };
      }
    }

    if (this.isPlainObject(raw)) {
      return raw;
    }

    return {};
  }

  private parseSpawnArguments(raw: unknown): SpawnToolArguments {
    const value = this.coerceToolArguments(raw);
    const agentValue =
      value.agent ?? value.agentId ?? value.id ?? value.target ?? undefined;
    if (typeof agentValue !== "string" || agentValue.trim() === "") {
      throw new Error(
        `${ AgentRunner.SPAWN_TOOL_NAME } requires an "agent" property identifying the subagent to spawn.`
      );
    }

    const promptValue =
      value.prompt ?? value.message ?? value.input ?? value.instructions;
    if (typeof promptValue !== "string" || promptValue.trim() === "") {
      throw new Error(
        `${ AgentRunner.SPAWN_TOOL_NAME } requires a non-empty "prompt" string describing the task.`
      );
    }

    let variables: TemplateVariables | undefined;
    if (this.isPlainObject(value.variables)) {
      variables = value.variables as TemplateVariables;
    }

    let metadata: Record<string, unknown> | undefined;
    if (this.isPlainObject(value.metadata)) {
      metadata = value.metadata as Record<string, unknown>;
    }

    return {
      agent: agentValue.trim(),
      prompt: promptValue,
      variables,
      metadata,
    };
  }

  private async executeSpawnTool(
    invocation: AgentInvocation,
    runtime: AgentRuntimeOptions,
    event: Extract<StreamEvent, { type: "tool_call"; }>,
    parentDescriptor: AgentRuntimeDescriptor
  ): Promise<ToolResult> {
    if (!runtime.catalog.enableSubagents) {
      throw new Error("Subagent delegation is disabled for this run.");
    }

    const args = this.parseSpawnArguments(event.arguments);
    const descriptor = runtime.catalog.getSubagent(args.agent);
    if (!descriptor) {
      const available = runtime
        .catalog
        .listSubagents()
        .map((agent) => agent.id)
        .join(", ");
      throw new Error(
        available
          ? `Unknown subagent "${ args.agent }". Available agents: ${ available }.`
          : `Unknown subagent "${ args.agent }".`
      );
    }

    runtime.logger.debug(
      {
        agent: invocation.id,
        delegatedTo: descriptor.id,
        toolCallId: event.id,
      },
      "Spawning configured subagent"
    );

    const lifecycle = this.createLifecyclePayload(invocation);

    const spawnForHook = async (
      options: SpawnSubagentDelegateOptions
    ): Promise<SpawnSubagentDelegateResult> => {
      const targetDescriptor = runtime.catalog.getAgent(options.agentId);
      if (!targetDescriptor) {
        throw new Error(
          `Hook attempted to spawn unknown agent "${ options.agentId }".`
        );
      }

      runtime.logger.debug(
        {
          agent: invocation.id,
          delegatedTo: targetDescriptor.id,
          toolCallId: event.id,
          hook: HOOK_EVENTS.beforeSpawnSubagent,
        },
        "Hook spawning intermediary subagent"
      );

      const spawned = await invocation.spawn(targetDescriptor.definition, {
        prompt: options.prompt,
        variables: options.variables,
        context: options.context,
      });

      return {
        prompt: spawned.prompt,
        messages: spawned.messages,
        target: this.toTargetSummary(targetDescriptor),
      };
    };

    const hookPayload: SpawnSubagentHookPayload = {
      ...lifecycle,
      event,
      request: {
        agentId: args.agent,
        prompt: args.prompt,
        variables: args.variables,
        metadata: args.metadata,
      },
      target: this.toTargetSummary(descriptor),
      spawn: spawnForHook,
    };

    const hookDispatch = await this.dispatchHookOrThrow(
      runtime,
      invocation,
      HOOK_EVENTS.beforeSpawnSubagent,
      hookPayload
    );

    if (hookDispatch.blocked) {
      const reason =
        hookDispatch.blocked.reason ??
        "Subagent delegation blocked by hook.";

      runtime.logger.warn(
        {
          agent: invocation.id,
          delegatedTo: descriptor.id,
          toolCallId: event.id,
          reason,
        },
        "Subagent spawn vetoed by hook"
      );

      return {
        schema: AgentRunner.SPAWN_TOOL_RESULT_SCHEMA,
        content: reason,
        data: {
          agentId: descriptor.id,
          messageCount: 0,
          prompt: args.prompt,
          blocked: true,
        },
        metadata: {
          agentId: descriptor.id,
          model: descriptor.model,
          provider: descriptor.provider.name,
          parentAgentId: parentDescriptor.id,
          blocked: true,
        },
      };
    }

    const overrides = this.applySpawnOverrides(hookDispatch, {
      prompt: args.prompt,
      variables: args.variables,
    });

    const spawnOptions: AgentInvocationOptions = {
      prompt: overrides.prompt,
      variables: overrides.variables,
      ...(overrides.contextProvided && overrides.context
        ? { context: overrides.context }
        : {}),
    };

    const child = await invocation.spawn(descriptor.definition, spawnOptions);

    return AgentRunner.buildSubagentResult({
      child,
      descriptor,
      parentDescriptor,
      request: {
        prompt: overrides.prompt,
        variables: overrides.variables,
        context: overrides.contextProvided ? overrides.context : undefined,
        metadata: args.metadata,
      },
    });
  }

  private toTargetSummary(
    descriptor: AgentRuntimeDescriptor
  ): SpawnSubagentTargetSummary {
    return {
      id: descriptor.id,
      model: descriptor.model,
      provider: descriptor.provider.name,
      metadata: descriptor.metadata,
    };
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private applySpawnOverrides(
    dispatch: HookDispatchResult<(typeof HOOK_EVENTS)["beforeSpawnSubagent"]>,
    defaults: { prompt: string; variables?: TemplateVariables }
  ): {
    prompt: string;
    variables?: TemplateVariables;
    context?: PackedContext;
    contextProvided: boolean;
  } {
    let prompt = defaults.prompt;
    let variables = defaults.variables;
    let context: PackedContext | undefined;
    let contextProvided = false;

    for (const result of dispatch.results) {
      if (!isSpawnSubagentOverride(result)) {
        continue;
      }

      if (Object.hasOwn(result, "prompt") && result.prompt !== undefined) {
        prompt = result.prompt;
      }

      if (Object.hasOwn(result, "variables")) {
        variables = result.variables;
      }

      if (Object.hasOwn(result, "context")) {
        context = result.context;
        contextProvided = true;
      }
    }

    return { prompt, variables, context, contextProvided };
  }

  /**
     * Drives a single agent invocation through its lifecycle, emitting
     * `beforeAgentStart` once, then for each iteration optionally `preCompact`,
     * followed by `beforeModelCall`. Tool calls trigger the
     * `preToolUse`/`postToolUse` pair (or `onAgentError` on failure), stream
     * anomalies emit `notification`, `onError`, and `onAgentError`, and each
     * iteration culminates with `stop`. When the agent finishes cleanly,
     * `afterAgentComplete` fires, and non-root agents also raise `subagentStop`.
     */
  private async executeInvocation(invocation: AgentInvocation): Promise<void> {
    const runtime = this.runtimeMap.get(invocation);
    if (!runtime) {
      throw new Error(`No runtime registered for agent ${ invocation.id }`);
    }

    const descriptor = this.getInvocationDescriptor(invocation);

    const lifecycle = this.createLifecyclePayload(invocation);
    const runner = new AgentRunner({
      invocation,
      descriptor,
      streamRenderer: this.streamRenderer,
      hooks: runtime.hooks,
      logger: runtime.logger,
      cwd: runtime.cwd,
      confirm: runtime.confirm,
      lifecycle,
      startTraceAppend: invocation.isRoot ? runtime.traceAppend : true,
      composeToolSchemas: () => this.composeToolSchemas(invocation, runtime),
      executeSpawnTool: (event) =>
        this.executeSpawnTool(invocation, runtime, event, descriptor),
      applyTranscriptCompactionIfNeeded: async (iteration) => {
        await this.applyTranscriptCompactionIfNeeded(
          runtime,
          invocation,
          iteration,
          lifecycle
        );
      },
      dispatchHookOrThrow: (event, payload) =>
        this.dispatchHookOrThrow(runtime, invocation, event, payload),
      writeTrace: (event, append) =>
        this.writeTrace(runtime, invocation, event, append),
    });

    await runner.run();
  }

  private async writeTrace(
    runtime: AgentRuntimeOptions,
    invocation: AgentInvocation,
    event: AgentTraceEvent,
    append = true
  ): Promise<void> {
    if (!runtime.tracePath) {
      return;
    }

    const lifecycle = this.createLifecyclePayload(invocation);

    await this.traceWriter.write(
      runtime.tracePath,
      {
        phase: event.phase,
        agent: lifecycle.metadata,
        prompt: lifecycle.prompt,
        context: lifecycle.context,
        historyLength: lifecycle.historyLength,
        data: event.data,
        sessionId: runtime.sessionId,
        timestamp: new Date().toISOString(),
      },
      append
    );
  }

  private async dispatchHookOrThrow<K extends HookEventName>(
    runtime: AgentRuntimeOptions,
    invocation: AgentInvocation,
    event: K,
    payload: HookEventMap[ K ]
  ): Promise<HookDispatchResult<K>> {
    const dispatch = await runtime.hooks.emitAsync(event, payload);

    if (dispatch.error) {
      const serialized = this.serializeError(dispatch.error);
      runtime.logger.error(
        {
          agent: invocation.id,
          hook: event,
          err: serialized.message,
        },
        "Hook dispatch failed"
      );

      if (dispatch.error instanceof Error) {
        throw dispatch.error;
      }

      const error = new Error(
        `Hook "${ event }" failed: ${ serialized.message }`
      );
      (error as { cause?: unknown; }).cause = dispatch.error;
      throw error;
    }

    return dispatch;
  }

  private createLifecyclePayload(
    invocation: AgentInvocation
  ): AgentLifecyclePayload {
    return {
      metadata: this.createMetadata(invocation),
      prompt: invocation.prompt,
      context: {
        totalBytes: invocation.context.totalBytes,
        fileCount: invocation.context.files.length,
      },
      historyLength: invocation.history.length,
    };
  }

  private createMetadata(invocation: AgentInvocation): AgentMetadata {
    let depth = 0;
    let current = invocation.parent;
    while (current) {
      depth += 1;
      current = current.parent;
    }

    const metadata: AgentMetadata = {
      id: invocation.id,
      parentId: invocation.parent?.id,
      depth,
      isRoot: invocation.isRoot,
      systemPrompt: invocation.definition.systemPrompt,
      tools: (invocation.definition.tools ?? []).map((tool) => tool.name),
    };

    const descriptor = this.descriptorMap.get(invocation);
    if (descriptor) {
      metadata.model = descriptor.model;
      metadata.provider = descriptor.provider.name;
    }

    return metadata;
  }

  private serializeError(error: unknown): {
        message: string;
        stack?: string;
        cause?: unknown;
    } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        cause: (error as { cause?: unknown; }).cause,
      };
    }

    return { message: String(error) };
  }

  private async applyTranscriptCompactionIfNeeded(
    runtime: AgentRuntimeOptions,
    invocation: AgentInvocation,
    iteration: number,
    lifecycle: AgentLifecyclePayload
  ): Promise<void> {
    const selector = runtime.transcriptCompactor;
    if (!selector) {
      return;
    }

    const descriptor = this.getInvocationDescriptor(invocation);
    const compactor =
            typeof selector === "function"
              ? selector(invocation, descriptor) ?? undefined
              : selector;
    if (!compactor) {
      return;
    }

    const plan = await compactor.plan(invocation, iteration);
    if (!plan) {
      return;
    }

    const payload: AgentTranscriptCompactionPayload = {
      ...lifecycle,
      iteration,
      messages: invocation.messages,
      reason: plan.reason,
    };

    await runtime.hooks.emitAsync(HOOK_EVENTS.preCompact, payload);
    const result = await plan.apply();
    if (result && typeof result === "object") {
      runtime.logger.debug(
        {
          agent: invocation.id,
          removedMessages: result.removedMessages,
          reason: plan.reason,
        },
        "Transcript compacted"
      );
    }
  }
}
