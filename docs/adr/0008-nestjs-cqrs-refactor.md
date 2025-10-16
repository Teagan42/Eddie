# ADR 0008: NestJS CQRS Realtime Migration

## Status

Accepted

## Context

Realtime chat updates and trace streaming were previously managed through ad-hoc
gateway services that mixed persistence, transport events, and orchestration
logic. As the API accumulated more websocket use cases, the lack of a consistent
pattern made it difficult to reason about how commands, queries, and events
flowed through the system. Moving these responsibilities onto NestJS CQRS lets
us codify realtime behaviour with explicit command and event handlers, reuse the
same testing story already adopted by the chat session modules, and unlock
predictable extension points for new realtime surfaces.

## Decision

We migrated realtime orchestration into first-class CQRS handlers. The new
`apps/api/src/realtime` module coordinates websocket gateways while delegating
business logic into CQRS handlers. Within chat sessions, the
`apps/api/src/chat-sessions/commands` and `apps/api/src/chat-sessions/queries`
modules now publish websocket notifications through dedicated command and query
handlers, while `apps/api/src/chat-sessions/events` maps domain events into
structured gateway payloads. Supporting providers such as
`apps/api/src/orchestrator/orchestrator.service.ts` and
`apps/api/src/traces/events` were updated to emit CQRS events instead of calling
gateways directly. Downstream packages, including the generated
`platform/integrations/api-client`, now rely on a unified DTO shape emitted by the CQRS
handlers when consuming realtime updates.

## Consequences

- CQRS gives us deterministic handler boundaries for realtime features, making
  it easier to test new websocket flows in isolation.
- Realtime notifications share the same DTOs across the API and client packages,
  reducing duplication in `platform/integrations/api-client` and future SDKs.
- Downstream consumers must migrate to the new event envelopes. Existing
  websocket clients should subscribe to the CQRS-streamed topics exposed in
  `chat-sessions.gateway.ts` and update their payload parsing to match the DTOs
  emitted by the new handlers. We provided a migration checklist for partner
  teams covering topic names, DTO versioning, and deprecation timelines, with
  explicit migration considerations for downstream consumers captured in the
  rollout notes.
