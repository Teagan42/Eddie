import { Injectable } from "@nestjs/common";
import {
  AgentStreamEvent,
  HOOK_EVENTS,
  normalizeHookStopMessages,
  type StreamEvent,
} from "@eddie/types";
import { isHookStopEnqueueResponse } from "@eddie/hooks";

import type { AgentIterationPayload, AgentRunnerOptions } from "../agent-runner";
import type { SerializeErrorFn } from "./types";
import { ToolCallHandler } from "./tool-call-handler";
import { TraceWriterDelegate } from "./trace-writer.delegate";

export interface AgentRunLoopContext {
  options: AgentRunnerOptions;
  createIterationPayload: (iteration: number) => AgentIterationPayload;
  getPreviousResponseId: () => string | undefined;
  setPreviousResponseId: (id: string | undefined) => void;
  emitSubagentStop: () => Promise<void>;
  serializeError: SerializeErrorFn;
  spawnToolName: string;
}

export interface AgentRunLoopResult {
  iterationCount: number;
  agentFailed: boolean;
}

@Injectable()
export class AgentRunLoop {
  constructor(
    private readonly toolCallHandler: ToolCallHandler,
    private readonly traceWriter: TraceWriterDelegate
  ) {}

  async run(context: AgentRunLoopContext): Promise<AgentRunLoopResult> {
    const {
      options,
      createIterationPayload,
      getPreviousResponseId,
      setPreviousResponseId,
      emitSubagentStop,
      serializeError,
      spawnToolName,
    } = context;
    const {
      invocation,
      descriptor,
      streamRenderer,
      eventBus,
      hooks,
      composeToolSchemas,
      applyTranscriptCompactionIfNeeded,
      dispatchHookOrThrow,
      writeTrace,
      metrics,
      lifecycle,
    } = options;

    let iteration = 0;
    let agentFailed = false;
    let continueConversation = true;

    try {
      while (continueConversation) {
        iteration += 1;
        continueConversation = false;

        const iterationPayload = createIterationPayload(iteration);

        await metrics.timeOperation(
          "transcript.compaction",
          () => applyTranscriptCompactionIfNeeded(iteration, iterationPayload)
        );

        await hooks.emitAsync(HOOK_EVENTS.beforeModelCall, iterationPayload);
        await this.traceWriter.write({
          writeTrace,
          event: {
            phase: "model_call",
            data: {
              iteration,
              messageCount: invocation.messages.length,
              model: descriptor.model,
              provider: descriptor.provider.name,
            },
          },
        });

        const toolSchemas = composeToolSchemas();

        const publishWithAgent = (incoming: StreamEvent): void => {
          eventBus.publish(
            new AgentStreamEvent({ ...incoming, agentId: invocation.id })
          );
        };

        const providerMessages = options.memoryBinding
          ? await options.memoryBinding.prepareProviderMessages({
              messages: invocation.messages,
              invocation,
              descriptor,
            })
          : invocation.messages;

        const stream = descriptor.provider.stream({
          model: descriptor.model,
          messages: providerMessages,
          tools: toolSchemas,
          ...(getPreviousResponseId()
            ? { previousResponseId: getPreviousResponseId() }
            : {}),
        });

        let assistantBuffer = "";
        let reasoningBuffer = "";

        for await (const event of stream) {
          if (event.type === "delta") {
            assistantBuffer += event.text;
            publishWithAgent(event);
            continue;
          }

          if (event.type === "reasoning_delta") {
            if (event.text) {
              reasoningBuffer += event.text;
            }
            publishWithAgent(event);
            continue;
          }

          if (event.type === "reasoning_end") {
            publishWithAgent(event);
            if (reasoningBuffer.length > 0) {
              streamRenderer.flush();
              reasoningBuffer = "";
            }
            continue;
          }

          if (event.type === "tool_call") {
            streamRenderer.flush();
            publishWithAgent(event);

            const shouldContinue = await this.toolCallHandler.handle({
              event,
              iteration,
              iterationPayload,
              options,
              publishWithAgent,
              spawnToolName,
              serializeError,
            });

            if (shouldContinue) {
              continueConversation = true;
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
            await this.traceWriter.write({
              writeTrace,
              event: {
                phase: "agent_error",
                data: {
                  iteration,
                  message,
                  cause,
                },
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
              setPreviousResponseId(event.responseId);
            }
            if (assistantBuffer.trim().length > 0) {
              invocation.messages.push({
                role: "assistant",
                content: assistantBuffer,
              });
              metrics.countMessage("assistant");
            }

            const stopDispatch = await dispatchHookOrThrow(HOOK_EVENTS.stop, {
              ...iterationPayload,
              messages: invocation.messages,
            });

            for (const result of stopDispatch.results ?? []) {
              if (!isHookStopEnqueueResponse(result)) {
                continue;
              }

              const normalized = normalizeHookStopMessages(result.enqueue);
              if (normalized.length === 0) {
                continue;
              }

              for (const message of normalized) {
                invocation.messages.push(message);
                metrics.countMessage(message.role);
              }

              continueConversation = true;
            }
            await this.traceWriter.write({
              writeTrace,
              event: {
                phase: "iteration_complete",
                data: {
                  iteration,
                  messageCount: invocation.messages.length,
                  finalMessage: invocation.messages.at(-1)?.content,
                },
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
      const serialized = serializeError(error);
      await dispatchHookOrThrow(HOOK_EVENTS.onAgentError, {
        ...lifecycle,
        error: serialized,
      });
      await this.traceWriter.write({
        writeTrace,
        event: {
          phase: "agent_error",
          data: serialized,
        },
      });
      metrics.countError("agent.run");
      await emitSubagentStop();
      throw error;
    }

    if (agentFailed) {
      return { agentFailed: true, iterationCount: iteration };
    }

    return { agentFailed: false, iterationCount: iteration };
  }
}
