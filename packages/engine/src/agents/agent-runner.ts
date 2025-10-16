import type { Logger } from "pino";
import { HOOK_EVENTS } from "@eddie/hooks";
import type {
  AgentLifecyclePayload,
  HookBus,
  HookDispatchResult,
  HookEventMap,
  HookEventName,
} from "@eddie/hooks";
import type { StreamRendererService } from "@eddie/io";
import type { EventBus } from "@nestjs/cqrs";
import type {
  AgentRuntimeDescriptor,
  ChatMessage,
  PackedContext,
  StreamEvent,
  ToolResult,
  ToolSchema,
} from "@eddie/types";
import { AgentStreamEvent } from "@eddie/types";
import type { TemplateVariables } from "@eddie/templates";
import type { AgentInvocation } from "./agent-invocation";
import type { MetricsService } from "../telemetry/metrics.service";

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
    } = this.options;

    if (!invocation.isRoot) {
      streamRenderer.flush();
    }

    await hooks.emitAsync(HOOK_EVENTS.beforeAgentStart, lifecycle);

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
