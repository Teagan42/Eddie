import { Injectable } from "@nestjs/common";
import { HOOK_EVENTS, type StreamEvent, type ToolResult } from "@eddie/types";

import type { AgentIterationPayload, AgentRunnerOptions } from "../agent-runner";
import type { SerializeErrorFn } from "./types";
import { TraceWriterDelegate } from "./trace-writer.delegate";

export interface ToolCallHandlerArgs {
  event: Extract<StreamEvent, { type: "tool_call" }>;
  iteration: number;
  iterationPayload: AgentIterationPayload;
  options: AgentRunnerOptions;
  publishWithAgent: (event: StreamEvent) => void;
  spawnToolName: string;
  serializeError: SerializeErrorFn;
}

@Injectable()
export class ToolCallHandler {
  constructor(private readonly traceWriter: TraceWriterDelegate) {}

  async handle(args: ToolCallHandlerArgs): Promise<boolean> {
    const { event, iteration, iterationPayload, options, publishWithAgent, spawnToolName, serializeError } = args;
    const {
      invocation,
      metrics,
      logger,
      hooks,
      dispatchHookOrThrow,
      executeSpawnTool,
      executionTreeTracker,
      cwd,
      confirm,
      writeTrace,
    } = options;

    executionTreeTracker?.recordToolCall(invocation.id, event);

    const preToolDispatch = await dispatchHookOrThrow(HOOK_EVENTS.preToolUse, {
      ...iterationPayload,
      event,
    });

    await this.traceWriter.write({
      writeTrace,
      event: {
        phase: "tool_call",
        data: {
          iteration,
          id: event.id,
          name: event.name,
          arguments: event.arguments,
        },
      },
    });

    const serializedArguments = event.arguments ? JSON.stringify(event.arguments) : "";

    invocation.messages.push({
      role: "assistant",
      content: serializedArguments,
      name: event.name,
      tool_call_id: event.id,
    });
    metrics.countMessage("assistant");

    const blockSignal = preToolDispatch.blocked;

    if (blockSignal) {
      const reason = blockSignal.reason ?? "Tool execution blocked by hook.";

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

      return true;
    }

    try {
      const result = await this.executeTool({
        event,
        spawnToolName,
        executeSpawnTool,
        invocation,
        cwd,
        confirm,
      });

      const { id, name, arguments: toolArguments } = event;

      publishWithAgent({
        type: "tool_result",
        name,
        id,
        result,
      });

      executionTreeTracker?.recordToolResult(
        invocation.id,
        { type: "tool_result", id, name, result },
        result
      );

      invocation.messages.push({
        role: "tool",
        name,
        tool_call_id: id,
        content: JSON.stringify(this.buildMessagePayload(result)),
      });

      await dispatchHookOrThrow(HOOK_EVENTS.postToolUse, {
        ...iterationPayload,
        event,
        result,
      });

      await this.traceWriter.write({
        writeTrace,
        event: {
          phase: "tool_result",
          data: {
            iteration,
            id,
            name,
            arguments: toolArguments,
            result,
          },
        },
      });

      metrics.observeToolCall({
        name,
        status: "success",
      });

      return true;
    } catch (error) {
      const serialized = serializeError(error);
      const message = `Tool execution failed: ${serialized.message}`;
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

      await this.traceWriter.write({
        writeTrace,
        event: {
          phase: "tool_error",
          data: {
            iteration,
            id: event.id,
            name: event.name,
            error: serialized,
          },
        },
      });

      executionTreeTracker?.recordToolError(invocation.id, event, serialized);

      metrics.observeToolCall({
        name: event.name,
        status: "error",
      });
      metrics.countError("tool.execution");

      return true;
    }
  }

  private async executeTool(options: {
    event: Extract<StreamEvent, { type: "tool_call" }>;
    spawnToolName: string;
    executeSpawnTool: AgentRunnerOptions["executeSpawnTool"];
    invocation: AgentRunnerOptions["invocation"];
    cwd: string;
    confirm: AgentRunnerOptions["confirm"];
  }): Promise<ToolResult> {
    const { event, spawnToolName, executeSpawnTool, invocation, cwd, confirm } = options;

    if (event.name === spawnToolName) {
      return executeSpawnTool(event);
    }

    return invocation.toolRegistry.execute(event, {
      cwd,
      confirm,
      env: process.env,
    });
  }

  private buildMessagePayload(result: ToolResult): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      schema: result.schema,
      content: result.content,
    };

    if (result.data !== undefined) {
      payload.data = result.data;
    }

    if (result.metadata !== undefined) {
      payload.metadata = result.metadata;
    }

    return payload;
  }
}
