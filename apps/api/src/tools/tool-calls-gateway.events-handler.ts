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
    return {
      sessionId: state.sessionId,
      id: state.toolCallId,
      name: state.name,
      arguments: state.arguments,
      result: state.result,
      timestamp: state.updatedAt ?? state.startedAt,
      agentId: state.agentId ?? null,
    };
  }
}
