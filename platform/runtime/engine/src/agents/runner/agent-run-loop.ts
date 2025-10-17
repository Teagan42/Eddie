import { Injectable } from "@nestjs/common";
import { AgentStreamEvent, HOOK_EVENTS, type StreamEvent } from "@eddie/types";

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

        const stream = descriptor.provider.stream({
          model: descriptor.model,
          messages: invocation.messages,
          tools: toolSchemas,
          ...(getPreviousResponseId()
            ? { previousResponseId: getPreviousResponseId() }
            : {}),
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

            await hooks.emitAsync(HOOK_EVENTS.stop, {
              ...iterationPayload,
              messages: invocation.messages,
            });
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
