# API CQRS Migration Blueprint

This blueprint documents the agreed upon command, query, and event surfaces for migrating the Eddie API modules to a CQRS-aligned architecture. The team validated the boundaries through async review notes captured during the design session on 2024-12-12 and the updates reflected below fold in the approved naming adjustments.

## Chat Sessions

### Commands
- `CreateChatSessionCommand` — instantiate a new chat session with metadata, participants, and initial routing preferences.
- `UpdateChatSessionParticipantsCommand` — add or remove participants, including role transitions (observer ↔ agent).
- `CloseChatSessionCommand` — mark the session closed for further inbound messages.
- `ArchiveChatSessionCommand` — move inactive sessions to cold storage while retaining replay references.

### Queries
- `GetChatSessionByIdQuery` — retrieve a full session aggregate by identifier.
- `ListChatSessionsByAgentQuery` — fetch active or historical sessions scoped to an agent or tenant.
- `GetChatSessionTranscriptQuery` — pull the rendered transcript blocks for downstream export.

### Events
- `ChatSessionCreatedEvent`
- `ChatSessionParticipantsUpdatedEvent`
- `ChatSessionClosedEvent`
- `ChatSessionArchivedEvent`

## Traces

### Commands
- `AppendTraceSpanCommand` — append execution spans emitted by tools or workflows.
- `FinalizeTraceCommand` — set a trace to immutable once the related run completes.
- `PurgeTraceCommand` — delete traces on retention expiry.

### Queries
- `GetTraceByIdQuery`
- `ListTracesForSessionQuery`
- `ListTraceSpansQuery`

### Events
- `TraceSpanAppendedEvent`
- `TraceFinalizedEvent`
- `TracePurgedEvent`

## Runtime Config

### Commands
- `SetRuntimeFlagCommand` — toggle feature flags that gate tool access or streaming modes.
- `UpdateRuntimeConfigCommand` — persist structured runtime settings (rate limits, gating, etc.).
- `ResetRuntimeConfigCommand` — restore a module’s config to defaults after incidents.

### Queries
- `GetRuntimeConfigQuery`
- `ListRuntimeFlagsQuery`
- `GetConfigHistoryQuery`

### Events
- `RuntimeFlagUpdatedEvent`
- `RuntimeConfigUpdatedEvent`
- `RuntimeConfigResetEvent`

## Tools

### Commands
- `RegisterToolCommand` — onboard a new tool contract with invocation metadata.
- `UpdateToolDefinitionCommand` — modify input schema, runtime hints, or guardrails.
- `DeactivateToolCommand` — prevent future invocations while preserving historic records.

### Queries
- `GetToolByIdQuery`
- `ListToolsQuery`
- `ListActiveToolsQuery`

### Events
- `ToolRegisteredEvent`
- `ToolUpdatedEvent`
- `ToolDeactivatedEvent`

## Chat Message Streaming

### Commands
- `StartMessageStreamCommand` — open a streaming channel for a chat session.
- `StopMessageStreamCommand` — close an active stream and flush pending batches.
- `PushStreamMessageCommand` — emit a payload chunk across the active stream.

### Queries
- `GetStreamStateQuery`
- `ListActiveStreamsQuery`

### Events
- `MessageStreamStartedEvent`
- `MessageStreamStoppedEvent`
- `StreamMessagePushedEvent`

## Implementation Structure

### Handler Boundaries
- Command handlers remain isolated per bounded context (e.g., chat sessions, traces) and orchestrate work through domain aggregates only.
- Query handlers never mutate state and rely on projection repositories tuned for read latency.
- Event handlers translate domain events into external notifications (webhooks, WebSocket relays) without cross-context writes.

### Folder Layout
- `apps/api/src/chat-sessions/commands`
- `apps/api/src/chat-sessions/queries`
- `apps/api/src/chat-sessions/events`
- `apps/api/src/traces/commands`
- `apps/api/src/traces/queries`
- `apps/api/src/runtime-config/commands`
- `apps/api/src/runtime-config/queries`
- `apps/api/src/tools/commands`
- `apps/api/src/tools/events`
- `apps/api/src/chat-message-streaming/commands`
- `apps/api/src/chat-message-streaming/events`

### Aggregate Dependencies
- `ChatSessionAggregate` with supporting `ChatSessionService` for persistence orchestration.
- `TraceAggregate` backed by the `TraceRepository` for span storage.
- `RuntimeConfigAggregate` integrating with `RuntimeConfigService` to read/write provider settings.
- `ToolRegistryAggregate` leveraging `ToolCatalogService` for discovery.
- `ChatMessageStreamAggregate` coordinating with `StreamGateway` to publish incremental payloads.

## Review Outcome
- Renamed `ResumeMessageStreamCommand` to `StartMessageStreamCommand` per runtime team feedback.
- Clarified that trace purges emit `TracePurgedEvent` for downstream cache invalidation.
- Confirmed folder naming alignment with existing NestJS module conventions.
