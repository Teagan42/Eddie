import { Injectable } from "@nestjs/common";
import type { Logger } from "pino";
import { JsonlWriterService, StreamRendererService } from "../../io";
import type { AgentLifecyclePayload, AgentMetadata, HookBus } from "../../hooks";
import type { ProviderAdapter } from "../types";
import { ToolRegistryFactory } from "../tools";
import type { AgentDefinition } from "./agent-definition";
import {
  AgentInvocation,
  type AgentInvocationOptions,
  type AgentSpawnHandler,
} from "./agent-invocation";

interface AgentTraceEvent {
  phase: string;
  data?: Record<string, unknown>;
}

export interface AgentRuntimeOptions {
  provider: ProviderAdapter;
  model: string;
  hooks: HookBus;
  confirm: (message: string) => Promise<boolean>;
  cwd: string;
  logger: Logger;
  tracePath?: string;
  traceAppend?: boolean;
}

export interface AgentRunRequest extends AgentInvocationOptions {
  definition: AgentDefinition;
  parent?: AgentInvocation;
}

@Injectable()
export class AgentOrchestratorService {
  private readonly runtimeMap = new WeakMap<AgentInvocation, AgentRuntimeOptions>();

  constructor(
    private readonly toolRegistryFactory: ToolRegistryFactory,
    private readonly streamRenderer: StreamRendererService,
    private readonly traceWriter: JsonlWriterService
  ) {}

  async runAgent(
    request: AgentRunRequest,
    runtime: AgentRuntimeOptions
  ): Promise<AgentInvocation> {
    const invocation = new AgentInvocation(
      request.definition,
      {
        prompt: request.prompt,
        context: request.context,
        history: request.history,
      },
      this.toolRegistryFactory,
      request.parent
    );

    const spawnHandler: AgentSpawnHandler = async (definition, options) =>
      this.spawnSubAgent(invocation, definition, options);
    invocation.setSpawnHandler(spawnHandler);

    if (request.parent) {
      request.parent.addChild(invocation);
    }

    this.runtimeMap.set(invocation, runtime);
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
        `Unable to spawn subagent for ${parent.id}; runtime context missing.`
      );
    }

    const invocation = new AgentInvocation(
      definition,
      options,
      this.toolRegistryFactory,
      parent
    );

    const spawnHandler: AgentSpawnHandler = async (childDefinition, childOptions) =>
      this.spawnSubAgent(invocation, childDefinition, childOptions);
    invocation.setSpawnHandler(spawnHandler);

    parent.addChild(invocation);
    this.runtimeMap.set(invocation, runtime);
    await this.executeInvocation(invocation);
    return invocation;
  }

  collectInvocations(root: AgentInvocation): AgentInvocation[] {
    const queue: AgentInvocation[] = [root];
    const result: AgentInvocation[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      queue.push(...current.children);
    }

    return result;
  }

  private async executeInvocation(invocation: AgentInvocation): Promise<void> {
    const runtime = this.runtimeMap.get(invocation);
    if (!runtime) {
      throw new Error(`No runtime registered for agent ${invocation.id}`);
    }

    if (!invocation.isRoot) {
      this.streamRenderer.flush();
    }

    const lifecycle = this.createLifecyclePayload(invocation);
    await runtime.hooks.emitAsync("beforeAgentStart", lifecycle);

    await this.writeTrace(
      runtime,
      invocation,
      {
        phase: "agent_start",
        data: {
          prompt: invocation.prompt,
          systemPrompt: invocation.definition.systemPrompt,
        },
      },
      invocation.isRoot ? runtime.traceAppend : true
    );

    let iteration = 0;
    let agentFailed = false;
    let continueConversation = true;
    let subagentStopEmitted = false;

    const emitSubagentStop = async (): Promise<void> => {
      if (invocation.isRoot || subagentStopEmitted) {
        return;
      }
      subagentStopEmitted = true;
      await runtime.hooks.emitAsync("SubagentStop", lifecycle);
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

        await runtime.hooks.emitAsync("beforeModelCall", iterationPayload);
        await this.writeTrace(runtime, invocation, {
          phase: "model_call",
          data: {
            iteration,
            messageCount: invocation.messages.length,
          },
        });

        const toolSchemas =
          invocation.toolRegistry.list().length > 0
            ? invocation.toolRegistry.schemas()
            : undefined;

        const stream = runtime.provider.stream({
          model: runtime.model,
          messages: invocation.messages,
          tools: toolSchemas,
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

            const preToolDispatch = await runtime.hooks.emitAsync("PreToolUse", {
              ...lifecycle,
              iteration,
              event,
            });
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
              const result = await invocation.toolRegistry.execute(event, {
                cwd: runtime.cwd,
                confirm: runtime.confirm,
                env: process.env,
              });

              invocation.messages.push({
                role: "tool",
                name: event.name,
                tool_call_id: event.id,
                content: result.content,
              });

              await runtime.hooks.emitAsync("PostToolUse", {
                ...lifecycle,
                iteration,
                event,
                result,
              });

              await this.writeTrace(runtime, invocation, {
                phase: "tool_result",
                data: {
                  iteration,
                  id: event.id,
                  name: event.name,
                  result: result.content,
                  metadata: result.metadata,
                },
              });

              continueConversation = true;
            } catch (error) {
              const serialized = this.serializeError(error);
              runtime.logger.error(
                { err: serialized.message, tool: event.name, agent: invocation.id },
                "Tool execution failed"
              );
              invocation.messages.push({
                role: "tool",
                name: event.name,
                tool_call_id: event.id,
                content: `Tool execution failed: ${serialized.message}`,
              });
              agentFailed = true;
              await runtime.hooks.emitAsync("onAgentError", {
                ...lifecycle,
                error: serialized,
              });
              await this.writeTrace(runtime, invocation, {
                phase: "agent_error",
                data: {
                  iteration,
                  tool: event.name,
                  ...serialized,
                },
              });
              break;
            }

            continue;
          }

          if (event.type === "error") {
            this.streamRenderer.render(event);
            agentFailed = true;

            await runtime.hooks.emitAsync("onError", {
              ...lifecycle,
              iteration,
              error: event,
            });
            await runtime.hooks.emitAsync("onAgentError", {
              ...lifecycle,
              error: {
                message: event.message,
                cause: event.cause,
              },
            });
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
            await runtime.hooks.emitAsync("Notification", {
              ...lifecycle,
              iteration,
              event,
            });
            continue;
          }

          if (event.type === "end") {
            this.streamRenderer.render(event);
            if (assistantBuffer.trim().length > 0) {
              invocation.messages.push({
                role: "assistant",
                content: assistantBuffer,
              });
            }

            await runtime.hooks.emitAsync("Stop", {
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
      await runtime.hooks.emitAsync("onAgentError", {
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

    await runtime.hooks.emitAsync("afterAgentComplete", {
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
        timestamp: new Date().toISOString(),
      },
      append
    );
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

    return {
      id: invocation.id,
      parentId: invocation.parent?.id,
      depth,
      isRoot: invocation.isRoot,
      systemPrompt: invocation.definition.systemPrompt,
      tools: (invocation.definition.tools ?? []).map((tool) => tool.name),
    };
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
        cause: (error as { cause?: unknown }).cause,
      };
    }

    return { message: String(error) };
  }
}
