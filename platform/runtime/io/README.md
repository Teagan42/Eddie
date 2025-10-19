# Runtime IO services

The `@eddie/io` package delivers CLI-friendly NestJS services that wrap
logging, confirmation prompts, structured trace capture, and live stream
rendering. They can be consumed directly in CLI scripts or wired into a Nest
module by importing `IoModule`.

## LoggerService

`LoggerService` builds a Pino logger that defaults to stdout pretty-printing and
accepts runtime configuration via `configure({ level, destination,
enableTimestamps })`. Reusing the logger through `getLogger(scope)` applies
per-scope bindings while sharing transports. When the CLI boots, the engine
calls `LoggerService.configure` with the user's project configuration before
starting any agents (`platform/runtime/engine/src/engine.service.ts`).

The service exposes an observer API through `registerListener`, which notifies
listeners with `{ level, args }` for every log method invocation. Observers are
returned an unsubscribe callback so they can detach cleanly when no longer
needed. The API layer uses this hook to forward log lines into the Nest
`LogsService` and WebSocket gateways (`apps/api/src/logs/logs-forwarder.service.ts`),
while CLI code and tests can subscribe to the same stream to capture verbose
output (`apps/cli/test/unit/core/agents/agent-orchestrator.service.test.ts`).
Downstream applications can point logs at new transports by supplying a
`LoggingConfig.destination` object or by installing a custom listener that ships
events elsewhere.

## ConfirmService

`ConfirmService` exposes `create({ autoApprove, nonInteractive })`, returning an
async prompt function. The CLI engine wires this into runtime options so that
non-interactive runs automatically decline prompts while `--yes` or matching
configurations auto-approve tool usage (`platform/runtime/engine/src/engine.service.ts`).
The generated prompt uses Node's readline interface, allowing hosts to override
stdin/stdout or wrap the returned function with additional telemetry.

## JsonlWriterService

`JsonlWriterService` writes structured JSON Lines records to disk, ensuring the
output directory exists before appending. Consumers call
`write(filePath, event, append?)`; when `append` is `false` the file is reset
before writing the payload. Like the logger, the writer supports observers via
`registerListener`. Each append notifies listeners with `{ filePath, event,
append }`, allowing downstream systems to mirror traces to alternative stores.
The API reuses this signal to emit tracing notifications over WebSockets (`apps/api/src/logs/logs-forwarder.service.ts`),
and the CLI runtime captures agent traces by calling `JsonlWriterService.write`
from the orchestrator whenever a lifecycle event occurs (`platform/runtime/engine/src/agents/agent-orchestrator.service.ts`).
When building custom dashboards, register a listener to transform the payloads
or swap the transport entirely.

## StreamRendererService

`StreamRendererService` formats `StreamEvent` payloads for human-friendly CLI
output. It tracks agent prefixes so incremental deltas print compactly and
supports notifications, tool calls, tool results, and terminal events. The
service uses `redactSecrets` with default patterns for OpenAI-style `sk-` keys,
GitHub personal tokens, and Google API keys before writing to stdout/stderr,
protecting secrets by default (`platform/runtime/io/src/stream-renderer.service.ts`).
`AgentStreamEventHandler` wires the renderer into the CQRS event bus so the CLI
receives streamed updates as agents run (`platform/runtime/io/src/agent-stream-event.handler.ts`).
`StreamRendererService` underpins the CLI integration, where `AgentRunner`
flushes output between agents and shares the renderer through runtime options
(`platform/runtime/engine/src/agents/agent-runner.ts`).

### Extending redaction and transports

Secret redaction defaults can be extended by wrapping `redactSecrets` with
custom regular expressions or by subclassing `StreamRendererService` to inject
additional patterns. CLI integration allows authors to override the renderer by
providing their own Nest provider that satisfies the same interface, enabling
alternate transports such as structured logging or rich TUI updates. Similarly,
`LoggerService` and `JsonlWriterService` observers expose extension points for
shipping events to remote sinks without modifying core runtime code. Register a
listener, transform the event, and forward it to your preferred destination to
layer additional monitoring.

## CLI integration and customization patterns

The CLI composes these services inside `IoModule`, pairing them with the engine
and hooks modules. Runtime configuration drives logging levels, prompt behavior,
trace destinations, and stream rendering without requiring code changes. When
customizing deployments, override the providers exported by `IoModule` or attach
listeners that bridge into your own observability stack. These patterns keep the
core runtime decoupled while giving downstream authors clear extension points
for CLI integration and beyond.
