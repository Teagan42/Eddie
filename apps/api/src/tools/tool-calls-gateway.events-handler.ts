import { Inject, Injectable } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { ToolsGateway } from "./tools.gateway";
import { ToolCallCompleted, ToolCallStarted, ToolCallUpdated, type ToolCallLifecycleEvent } from "./events";
import type { ToolCallState } from "./tool-call.store";

@Injectable()
@EventsHandler(ToolCallStarted, ToolCallUpdated, ToolCallCompleted)
export class ToolCallsGatewayEventsHandler implements IEventHandler<ToolCallLifecycleEvent> {
  constructor(@Inject(ToolsGateway) private readonly gateway: ToolsGateway) {}

  handle(event: ToolCallLifecycleEvent): void {
    const payload = this.createPayload(event.state);

    if (event instanceof ToolCallCompleted) {
      this.gateway.emitToolResult(payload);
      return;
    }

    this.gateway.emitToolCall(payload);
  }

  private createPayload(state: ToolCallState): Record<string, unknown> {
    const {
      sessionId,
      toolCallId,
      name,
      arguments: args,
      result,
      status,
      updatedAt,
      startedAt,
      agentId,
    } = state;

    return {
      sessionId,
      id: toolCallId,
      name,
      arguments: args,
      result,
      status,
      timestamp: updatedAt ?? startedAt,
      agentId: agentId ?? null,
    };
  }
}
