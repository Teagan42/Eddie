# ADR 0013: Real-time Event Streaming Architecture

## Status

Accepted

## Context

Interactive chat sessions and tooling dashboards require real-time event streaming so operators can observe agent progress without refreshing the page. Prior iterations of the API emitted HTTP polling endpoints that missed transient updates and introduced back-pressure on the REST controllers. With CQRS adoption and richer domain events we needed a dedicated channel that could broadcast session activity, tool invocations, traces, and logs to multiple clients simultaneously.

## Decision

We standardised on WebSocket gateways within the NestJS API, pairing them with the shared `createRealtimeChannel` client in `@eddie/api-client`. Feature-specific gateways (for example `ChatSessionsGateway`, `TracesGateway`, `LogsGateway`, `ToolsGateway`, and runtime configuration) emit structured events via the `emitEvent` helper, ensuring every payload follows the `{ event, data }` envelope the client expects. CQRS event handlers translate domain events into gateway calls, while the client manages reconnection, authentication updates, and message buffering per namespace.

## Consequences

- Streaming chat updates, trace spans, and tool progress now arrive with sub-second latency, keeping the web dashboard and CLI tails aligned.
- Shared typing across API DTOs and the client reduces serialization drift, and reconnection backoff keeps throughput stable during transient network failures.
- Adding new channels only requires wiring a gateway and event handler, allowing additional observability surfaces to ride the same infrastructure.

## Alternatives Considered

- **Server-Sent Events** – rejected because bi-directional messaging for chat input would still need a separate transport.
- **Periodic polling** – rejected; polling introduced unacceptable latency and wasted compute when most sessions sat idle.
