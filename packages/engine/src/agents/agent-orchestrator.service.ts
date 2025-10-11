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
import type { TemplateVariables } from "@eddie/templates";

interface AgentTraceEvent {
    phase: string;
    data?: Record<string, unknown>;
}

const SPAWN_TOOL_NAME = "spawn_subagent";
const SPAWN_TOOL_RESULT_SCHEMA = "eddie.tool.spawn_subagent.result.v1";

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

export interface TranscriptCompactionResult {
    removedMessages?: number;
}

export interface TranscriptCompactionPlan {
    reason?: string;
    apply(): Promise<TranscriptCompactionResult | void> | TranscriptCompactionResult | void;
}

export interface TranscriptCompactor {
    plan(
        invocation: AgentInvocation,
        iteration: number
    ): Promise<TranscriptCompactionPlan | null | undefined> |
        TranscriptCompactionPlan | null | undefined;
}

export type TranscriptCompactorSelector =
    | TranscriptCompactor
    | ((
        invocation: AgentInvocation,
        descriptor: AgentRuntimeDescriptor
    ) => TranscriptCompactor | null | undefined);

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

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      queue.push(...current.children);
    }

    return result;
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
                  ? `${ agent.id } (${ agent.metadata.name })`
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
      name: SPAWN_TOOL_NAME,
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
        `${ SPAWN_TOOL_NAME } requires an "agent" property identifying the subagent to spawn.`
      );
    }

    const promptValue =
            value.prompt ?? value.message ?? value.input ?? value.instructions;
    if (typeof promptValue !== "string" || promptValue.trim() === "") {
      throw new Error(
        `${ SPAWN_TOOL_NAME } requires a non-empty "prompt" string describing the task.`
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
    const toSummary = (
      target: AgentRuntimeDescriptor
    ): SpawnSubagentTargetSummary => ({
      id: target.id,
      model: target.model,
      provider: target.provider.name,
      metadata: target.metadata,
    });

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
        target: toSummary(targetDescriptor),
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
      target: toSummary(descriptor),
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
        schema: SPAWN_TOOL_RESULT_SCHEMA,
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

    const finalMessage = child.messages.at(-1);
    const content =
            finalMessage && finalMessage.content.trim().length > 0
              ? finalMessage.content
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
    if (args.metadata && Object.keys(args.metadata).length > 0) {
      metadata.request = args.metadata;
    }

    const data: Record<string, unknown> = {
      agentId: descriptor.id,
      messageCount: child.messages.length,
      prompt: overrides.prompt,
    };

    if (finalMessage?.content) {
      data.finalMessage = finalMessage.content;
    }

    if (overrides.variables && Object.keys(overrides.variables).length > 0) {
      data.variables = overrides.variables;
    }

    if (overrides.contextProvided && overrides.context) {
      data.context = overrides.context;
    }

    return {
      schema: SPAWN_TOOL_RESULT_SCHEMA,
      content,
      data,
      metadata,
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

    if (!invocation.isRoot) {
      this.streamRenderer.flush();
    }

    const lifecycle = this.createLifecyclePayload(invocation);
    await runtime.hooks.emitAsync(HOOK_EVENTS.beforeAgentStart, lifecycle);

    await this.writeTrace(
      runtime,
      invocation,
      {
        phase: "agent_start",
        data: {
          prompt: invocation.prompt,
          systemPrompt: invocation.definition.systemPrompt,
          model: descriptor.model,
          provider: descriptor.provider.name,
        },
      },
      invocation.isRoot ? runtime.traceAppend : true
    );

    let iteration = 0;
    let agentFailed = false;
    let continueConversation = true;
    let subagentStopEmitted = false;
    let previousResponseId: string | undefined;

    const emitSubagentStop = async (): Promise<void> => {
      if (invocation.isRoot || subagentStopEmitted) {
        return;
      }
      subagentStopEmitted = true;
      await runtime.hooks.emitAsync(HOOK_EVENTS.subagentStop, lifecycle);
    };

    try {
      while (continueConversation) {
        iteration += 1;
        continueConversation = false;

        const iterationPayload = {
          ...lifecycle,
          iteration,
          messages: invocation.messages,
        };

        await this.applyTranscriptCompactionIfNeeded(
          runtime,
          invocation,
          iteration,
          lifecycle
        );

        await runtime.hooks.emitAsync(
          HOOK_EVENTS.beforeModelCall,
          iterationPayload
        );
        await this.writeTrace(runtime, invocation, {
          phase: "model_call",
          data: {
            iteration,
            messageCount: invocation.messages.length,
            model: descriptor.model,
            provider: descriptor.provider.name,
          },
        });

        const toolSchemas = this.composeToolSchemas(invocation, runtime);

        const stream = descriptor.provider.stream({
          model: descriptor.model,
          messages: invocation.messages,
          tools: toolSchemas,
          ...(previousResponseId ? { previousResponseId } : {}),
        });

        let assistantBuffer = "";

        for await (const event of stream) {
          if (event.type === "delta") {
            assistantBuffer += event.text;
            this.streamRenderer.render(event);
            continue;
          }

          if (event.type === "tool_call") {
            this.streamRenderer.flush();
            this.streamRenderer.render(event);

            const preToolDispatch = await this.dispatchHookOrThrow(
              runtime,
              invocation,
              HOOK_EVENTS.preToolUse,
              {
                ...lifecycle,
                iteration,
                event,
              }
            );
            await this.writeTrace(runtime, invocation, {
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

              runtime.logger.warn(
                {
                  tool: event.name,
                  agent: invocation.id,
                  reason,
                },
                "Tool execution vetoed by hook"
              );

              continueConversation = true;
              continue;
            }

            try {
              const result =
                                event.name === SPAWN_TOOL_NAME
                                  ? await this.executeSpawnTool(
                                    invocation,
                                    runtime,
                                    event,
                                    descriptor
                                  )
                                  : await invocation.toolRegistry.execute(event, {
                                    cwd: runtime.cwd,
                                    confirm: runtime.confirm,
                                    env: process.env,
                                  });

              this.streamRenderer.render({
                type: "tool_result",
                name: event.name,
                id: event.id,
                result,
              });

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

              await this.dispatchHookOrThrow(
                runtime,
                invocation,
                HOOK_EVENTS.postToolUse,
                {
                  ...lifecycle,
                  iteration,
                  event,
                  result,
                }
              );

              await this.writeTrace(runtime, invocation, {
                phase: "tool_result",
                data: {
                  iteration,
                  id: event.id,
                  name: event.name,
                  result,
                },
              });

              continueConversation = true;
            } catch (error) {
              const serialized = this.serializeError(error);
              const message = `Tool execution failed: ${ serialized.message }`;
              const notification: Extract<StreamEvent, { type: "notification"; }> = {
                type: "notification",
                payload: message,
                metadata: {
                  tool: event.name,
                  tool_call_id: event.id,
                  severity: "error",
                },
              };

              runtime.logger.warn(
                { err: serialized.message, tool: event.name, agent: invocation.id },
                "Tool execution failed"
              );

              this.streamRenderer.render(notification);

              invocation.messages.push({
                role: "tool",
                name: event.name,
                tool_call_id: event.id,
                content: message,
              });

              await runtime.hooks.emitAsync(HOOK_EVENTS.notification, {
                ...lifecycle,
                iteration,
                event: notification,
              });

              await this.writeTrace(runtime, invocation, {
                phase: "tool_error",
                data: {
                  iteration,
                  id: event.id,
                  name: event.name,
                  error: serialized,
                },
              });

              continueConversation = true;
              continue;
            }

            continue;
          }

          if (event.type === "error") {
            this.streamRenderer.render(event);
            agentFailed = true;

            await this.dispatchHookOrThrow(
              runtime,
              invocation,
              HOOK_EVENTS.onError,
              {
                ...lifecycle,
                iteration,
                error: event,
              }
            );
            await this.dispatchHookOrThrow(
              runtime,
              invocation,
              HOOK_EVENTS.onAgentError,
              {
                ...lifecycle,
                error: {
                  message: event.message,
                  cause: event.cause,
                },
              }
            );
            await this.writeTrace(runtime, invocation, {
              phase: "agent_error",
              data: {
                iteration,
                message: event.message,
                cause: event.cause,
              },
            });

            break;
          }

          if (event.type === "notification") {
            this.streamRenderer.render(event);
            await runtime.hooks.emitAsync(HOOK_EVENTS.notification, {
              ...lifecycle,
              iteration,
              event,
            });
            continue;
          }

          if (event.type === "end") {
            this.streamRenderer.render(event);
            if (event.responseId) {
              previousResponseId = event.responseId;
            }
            if (assistantBuffer.trim().length > 0) {
              invocation.messages.push({
                role: "assistant",
                content: assistantBuffer,
              });
            }

            await runtime.hooks.emitAsync(HOOK_EVENTS.stop, {
              ...lifecycle,
              iteration,
              messages: invocation.messages,
            });
            await this.writeTrace(runtime, invocation, {
              phase: "iteration_complete",
              data: {
                iteration,
                messageCount: invocation.messages.length,
                finalMessage: invocation.messages.at(-1)?.content,
              },
            });

            continue;
          }

          this.streamRenderer.render(event);
        }

        if (agentFailed) {
          break;
        }
      }
    } catch (error) {
      agentFailed = true;
      const serialized = this.serializeError(error);
      await this.dispatchHookOrThrow(runtime, invocation, HOOK_EVENTS.onAgentError, {
        ...lifecycle,
        error: serialized,
      });
      await this.writeTrace(runtime, invocation, {
        phase: "agent_error",
        data: serialized,
      });
      await emitSubagentStop();
      throw error;
    }

    if (agentFailed) {
      await emitSubagentStop();
      return;
    }

    await runtime.hooks.emitAsync(HOOK_EVENTS.afterAgentComplete, {
      ...lifecycle,
      iterations: iteration,
      messages: invocation.messages,
    });
    await emitSubagentStop();
    await this.writeTrace(runtime, invocation, {
      phase: "agent_complete",
      data: {
        iterations: iteration,
        messageCount: invocation.messages.length,
        finalMessage: invocation.messages.at(-1)?.content,
      },
    });
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
