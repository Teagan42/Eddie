# API Realtime Event Inventory

This inventory captures the event producers that currently power realtime experiences in the API surface. It focuses on the
sources called out for the CQRS migration spike so we can verify payload shape, transport, and downstream consumers before
designing new read models. Pair this table with the baseline note in `api-realtime-baseline.md` for transport topology.

## ChatSessionsService

| Source | Event | Payload | Dispatch Path | Consumers |
| --- | --- | --- | --- | --- |
| ChatSessionsService | session.created | `ChatSessionDto` (id, title, description, status, timestamps) | `notifySessionCreated` → `ChatSessionsGateway.onSessionCreated` → `emitEvent("session.created")` | WebSocket clients on `/chat-sessions`; ChatSessionsGateway |
| ChatSessionsService | session.updated | `ChatSessionDto` snapshot | `notifySessionUpdated` → `ChatSessionsGateway.onSessionUpdated` → `emitEvent("session.updated")` | WebSocket clients on `/chat-sessions`; ChatSessionsGateway |
| ChatSessionsService | session.deleted | `{ id: string }` | `notifySessionDeleted` → `ChatSessionsGateway.onSessionDeleted` → `emitEvent("session.deleted")` | WebSocket clients on `/chat-sessions`; ChatSessionsGateway |
| ChatSessionsService | message.created | `ChatMessageDto` | `notifyMessageCreated` → `ChatSessionsGateway.onMessageCreated` → `emitEvent("message.created")` | WebSocket clients on `/chat-sessions`; ChatSessionsGateway |
| ChatSessionsService | message.updated | `ChatMessageDto` | `notifyMessageUpdated` → `ChatSessionsGateway.onMessageUpdated` → `emitEvent("message.updated")` | WebSocket clients on `/chat-sessions`; ChatSessionsGateway |
| ChatSessionsService | agent.activity | `{ sessionId, state, timestamp }` | `notifyAgentActivity` → `ChatSessionsGateway.onAgentActivity` → `emitEvent("agent.activity")` | WebSocket clients on `/chat-sessions`; ChatSessionsGateway |
| ChatSessionsService | ChatMessageCreatedEvent | `{ sessionId, messageId }` | `eventBus.publish(new ChatMessageCreatedEvent)` | `ChatSessionsEngineListener` (CQRS handler); downstream engine orchestration |

## ChatSessionStreamRendererService

| Source | Event | Payload | Dispatch Path | Consumers |
| --- | --- | --- | --- | --- |
| ChatSessionStreamRendererService | ChatMessagePartialEvent | `ChatMessageDto` with incremental assistant content | `emitPartial` → `eventBus.publish` → `ChatSessionEventsService.handle` → `ChatMessagesGateway.emitPartial("message.partial")` | WebSocket clients on `/chat-messages`; ChatSessionEventsService; ChatMessagesGateway |
| ChatSessionStreamRendererService | ChatSessionToolCallEvent | `{ sessionId, id?, name?, arguments?, timestamp, agentId? }` | `emitToolCallEvent` → `eventBus.publish` → `ChatSessionEventsService.emitToolCall` → `ToolsGateway.emitToolCall("tool.call")` | WebSocket clients on `/tools`; ChatSessionEventsService; ToolsGateway |
| ChatSessionStreamRendererService | ChatSessionToolResultEvent | `{ sessionId, id?, name?, result?, timestamp, agentId? }` | `emitToolResultEvent` → `eventBus.publish` → `ChatSessionEventsService.emitToolResult` → `ToolsGateway.emitToolResult("tool.result")` | WebSocket clients on `/tools`; ChatSessionEventsService; ToolsGateway |
| StreamRendererService | stream console output | Raw `StreamEvent` payload rendered to stdout/stderr | `StreamRendererService.render` writes formatted output directly | CLI users; process stdout/stderr |

## Traces CQRS Handlers

| Source | Event | Payload | Dispatch Path | Consumers |
| --- | --- | --- | --- | --- |
| CreateTraceHandler | trace.created | `TraceDto` (id, sessionId?, name, status, durationMs?, metadata, timestamps) | `CommandBus.execute(CreateTraceCommand)` → `TraceCreated` domain event → `TracesGatewayEventsHandler.emitTraceCreated` | WebSocket clients on `/traces`; TracesGateway |
| UpdateTraceHandler | trace.updated | `TraceDto` snapshot | `CommandBus.execute(UpdateTraceCommand)` → `TraceUpdated` domain event → `TracesGatewayEventsHandler.emitTraceUpdated` | WebSocket clients on `/traces`; TracesGateway |

## RuntimeConfigService

| Source | Event | Payload | Dispatch Path | Consumers |
| --- | --- | --- | --- | --- |
| RuntimeConfigService | config.updated | `RuntimeConfigDto` snapshot | `RuntimeConfigService.update` → `RuntimeConfigStore.setSnapshot` → `changes$` emission → `RuntimeConfigGateway.onConfigChanged` → `emitEvent("config.updated")` | WebSocket clients on `/config`; RuntimeConfigGateway |

## LogsForwarderService

| Source | Event | Payload | Dispatch Path | Consumers |
| --- | --- | --- | --- | --- |
| LogsForwarderService | logs.created | `LogEntryDto` | `handleLoggerEvent`/`handleJsonlEvent` → `LogsService.append` → `LogsGateway.onLogCreated` → buffered `emitEvent("logs.created")` | WebSocket clients on `/logs`; LogsGateway |
| LogsForwarderService | tool.call | Normalised tool invocation (sessionId, id?, name?, arguments?, timestamp, agentId?) | `handleJsonlEvent` with phase `tool_call` → `ToolsGateway.emitToolCall("tool.call")` | WebSocket clients on `/tools`; ToolsGateway |
| LogsForwarderService | tool.result | Normalised tool result (sessionId, id?, name?, result?, timestamp, agentId?) | `handleJsonlEvent` with phase `tool_result` → `ToolsGateway.emitToolResult("tool.result")` | WebSocket clients on `/tools`; ToolsGateway |

## Stakeholder Validation Checklist

- [ ] Review this inventory with API, web, and observability stakeholders to confirm no websocket or CQRS handler is missed.
- [ ] Confirm payload stability expectations for each consumer prior to introducing new CQRS read models.
