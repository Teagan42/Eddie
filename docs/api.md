# Eddie API

The Eddie API wraps the engine in a NestJS HTTP server that exposes health
checks today and leaves room for future automation endpoints. The module now
ships with a set of global providers to ensure consistent behaviour across
routes. Review the
[Dependency Injection Best Practices](./di-best-practices.md) guide for a
deeper look at how constructor injection, tokens, and module boundaries work
across shared packages before extending these modules.

## Global Providers

The following providers are registered with NestJS using the `APP_*` tokens:

- **`ApiValidationPipe`** – wraps Nest's `ValidationPipe` with configuration from
  the Eddie config file and structured logging. Validation failures emit
  structured warnings and return a JSON payload describing the offending fields.
- **`ApiHttpExceptionFilter`** – formats uncaught exceptions, emits telemetry via
  the shared logger, and optionally includes stack traces when telemetry is
  configured for debugging.
- **`RequestLoggingInterceptor`** – produces structured request logs (including
  optional request/response bodies when the global log level is `debug`).
- **`ApiCacheInterceptor`** – caches successful `GET` responses and invalidates
  entries automatically when the project context changes.
- **`ApiKeyGuard`** – enforces API key authentication for all routes by default
  while respecting the `@Public()` decorator for unauthenticated endpoints such
  as health checks.

The existing `HttpLoggerMiddleware` still runs first in the pipeline so that low
level request timing is captured before other handlers run.

## CQRS buses and module boundaries

The API now relies on the NestJS CQRS package so reads, writes, and event
fan-out move through dedicated buses:

- **Command Bus** – controllers and gateways dispatch commands for any
  write-oriented action (for example creating chat sessions or updating the
  runtime configuration). Handlers live beside the feature services and emit
  domain events when aggregates mutate.【F:apps/api/src/chat-sessions/commands/send-chat-message.handler.ts†L9-L34】【F:apps/api/src/runtime-config/commands/update-runtime-config.handler.ts†L9-L26】
- **Query Bus** – read models resolve through query handlers that translate the
  backing services into DTOs for HTTP responses and websocket snapshots.【F:apps/api/src/chat-sessions/queries/list-chat-sessions.handler.ts†L8-L24】【F:apps/api/src/traces/queries/get-traces.handler.ts†L8-L28】
- **Event Bus** – domain events raised by command handlers are forwarded to
  websocket gateways and other subscribers to keep connected clients current
  without polling.【F:apps/api/src/chat-sessions/chat-sessions.gateway.events-handler.ts†L14-L64】【F:apps/api/src/runtime-config/runtime-config.gateway.events-handler.ts†L7-L23】

Feature modules scope their CQRS handlers alongside the existing services:

- **`ChatSessionsModule`** wires commands (`CreateChatSession`, `UpdateChatSession`,
  `ArchiveChatSession`, `DeleteChatSession`, `SendChatMessage`), queries (`ListChatSessions`,
  `GetChatSession`, `GetChatMessages`), and events (`ChatSessionCreated`,
  `ChatSessionUpdated`, `ChatSessionDeleted`, `ChatMessageSent`, `AgentActivity`).
  The module bridges engine callbacks to the CQRS event bus so websocket clients
  stay in sync.【F:apps/api/src/chat-sessions/chat-sessions.module.ts†L12-L40】
- **`TracesModule`** exposes query handlers for `GetTraces`/`GetTrace` and command
  handlers for creating and updating trace records. Published `TraceCreated` and
  `TraceUpdated` events flow into the traces gateway for live dashboards.【F:apps/api/src/traces/traces.module.ts†L8-L24】【F:apps/api/src/traces/traces.gateway.events-handler.ts†L7-L24】
- **`RuntimeConfigModule`** manages read/write access to the in-memory runtime
  snapshot via `GetRuntimeConfigQuery` and `UpdateRuntimeConfigCommand` while
  notifying subscribers through the `RuntimeConfigUpdated` event and gateway.【F:apps/api/src/runtime-config/runtime-config.module.ts†L5-L38】
- **`ToolsModule`** listens for chat session tool events and rebroadcasts them
  over the `/tools` websocket channel (`tool.call`, `tool.result`) so the UI can
  render tool telemetry safely.【F:apps/api/src/tools/tools.module.ts†L4-L24】【F:apps/api/src/tools/tool-calls-gateway.events-handler.ts†L7-L42】

Refer to [ADR 0007 – Agent orchestrator and nested agents](./adr/0007-agent-orchestrator.md)
in `docs/adr/0007-agent-orchestrator.md` for the architectural motivation and to the migration notes for the full design:
[API CQRS Migration Blueprint](./migration/api-cqrs-design.md),
[API CQRS Guidelines](./migration/api-cqrs-guidelines.md), and
[Realtime events inventory](./migration/api-realtime-events.md).

## Configuration

The complete configuration schema and relationships are captured in the
[configuration diagram](./configuration.md#schema-visualization). Consult that
view to understand how API-specific settings align with shared agent controls.

All provider behaviour is driven by the new `api` section in `eddie.config.*`:

```jsonc
{
  "api": {
    "host": "127.0.0.1",
    "port": 4000,
    "telemetry": {
      "enabled": true,
      "consoleExporter": false,
      "exposeErrorStack": false
    },
    "validation": {
      "whitelist": true,
      "forbidNonWhitelisted": true,
      "transform": true,
      "enableImplicitConversion": true
    },
    "cache": {
      "enabled": true,
      "ttlSeconds": 10,
      "maxItems": 256
    },
    "auth": {
      "enabled": true,
      "apiKeys": ["primary-key", "secondary-key"]
    },
    "persistence": {
      "driver": "sqlite",
      "sqlite": {
        "filename": "./data/chat-sessions.sqlite"
      }
    },
    "demoSeeds": {
      "files": ["./fixtures/demo-seed.json"]
    }
  }
}
```

The guard accepts keys from the configuration file, the `EDDIE_API_KEY`/
`EDDIE_API_KEYS` environment variables, or context variables named `apiKeys` or
`API_KEYS`.

Set `api.persistence.driver` to `"memory"` (default) for ephemeral usage or pick
one of the SQL-backed drivers to persist chat sessions between restarts. The API
ships the necessary client libraries (`better-sqlite3`, `pg`, and `mysql2`) but
your deployment image still needs the native system packages those drivers
depend on (for example libssl when connecting to PostgreSQL over TLS). Supply
credentials directly in the config file or through environment variable
interpolation as shown in the YAML examples below.

Provide relative or absolute file paths under `api.demoSeeds.files` to preload
demo data for local walkthroughs. The array can be left empty or omitted
entirely in production deployments.

### Persistence drivers

#### SQLite (file-backed)

```yaml
api:
  persistence:
    driver: sqlite
    sqlite:
      filename: ./data/chat-sessions.sqlite
```

SQLite stores chat data on the local filesystem. Override `filename` to point to
an absolute path when running inside containers and ensure the directory is
writeable by the API process.

#### PostgreSQL

```yaml
api:
  persistence:
    driver: postgres
    postgres:
      connection:
        host: ${PGHOST:-127.0.0.1}
        port: ${PGPORT:-5432}
        database: ${PGDATABASE:-eddie}
        user: ${PGUSER:-eddie}
        password: ${PGPASSWORD:-changeme}
      ssl: ${PGSSL:-false}
```

The PostgreSQL driver uses the bundled `pg` client. Provide a structured
`connection` object as shown or set `api.persistence.postgres.url` to a
connection string such as `${DATABASE_URL}`. Toggle TLS by setting `ssl: true`
or pointing to a boolean environment variable (`PGSSL` in the example above).

#### MySQL

```yaml
api:
  persistence:
    driver: mysql
    mysql:
      connection:
        host: ${MYSQL_HOST:-127.0.0.1}
        port: ${MYSQL_PORT:-3306}
        database: ${MYSQL_DATABASE:-eddie}
        user: ${MYSQL_USER:-eddie}
        password: ${MYSQL_PASSWORD:-changeme}
      ssl: ${MYSQL_SSL:-false}
```

#### MariaDB

```yaml
api:
  persistence:
    driver: mariadb
    mariadb:
      connection:
        host: ${MARIADB_HOST:-127.0.0.1}
        port: ${MARIADB_PORT:-3306}
        database: ${MARIADB_DATABASE:-eddie}
        user: ${MARIADB_USER:-eddie}
        password: ${MARIADB_PASSWORD:-changeme}
      ssl: ${MARIADB_SSL:-false}
```

Both MySQL and MariaDB share the `mysql2` driver. Supply TLS configuration via
the optional `ssl` flag or additional keys (such as `ca`) in the connection
object.

When persistence is configured for SQLite, PostgreSQL, MySQL, or MariaDB the API
runs pending migrations automatically during startup. The `DatabaseService`
runs `knex.migrate.latest` against the configured database using the migrations
in `apps/api/migrations`, so simply starting the server (`npm run api:start`) is
enough to keep the schema current. Trigger the same process in CI by launching
the API with your production configuration and letting the bootstrap complete.

The [database diagram](./generated/database-diagram.md) captures the relational
model produced by these migrations. Regenerate it via
`npm run docs:database-diagram` whenever the persistence schema changes.

## Public Routes

Use the exported `@Public()` decorator to mark controllers or individual
handlers that should bypass API key enforcement:

```ts
@Controller("health")
export class HealthController {
  @Public()
  @Get()
  status(): { status: string } {
    return { status: "ok" };
  }
}
```

The API currently exposes the following HTTP routes:

- **`GET /health`** – liveness check that returns `{ "status": "ok" }` when the
  service is online.【F:apps/api/src/controllers/health.controller.ts†L1-L19】
- **`GET /health/ready`** – readiness check signalling downstream dependencies
  are reachable.【F:apps/api/src/controllers/health.controller.ts†L1-L19】
- **`GET /chat-sessions`** – list the in-memory or persisted chat sessions.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L20-L33】
- **`POST /chat-sessions`** – create a new session and return its identifier.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L35-L41】
- **`GET /chat-sessions/:id`** – fetch a single session by UUID.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L43-L49】
- **`PATCH /chat-sessions/:id`** – rename an existing session and responds with 200 OK including the updated metadata.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L77-L88】
- **`PATCH /chat-sessions/:id/archive`** – archive a session and keep historical
  records immutable.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L51-L57】
- **`DELETE /chat-sessions/:id`** – remove a session permanently and returns a 204 No Content response once cleanup is finished.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L90-L99】
- **`GET /chat-sessions/:id/messages`** – list all recorded messages for a
  session.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L59-L65】
- **`POST /chat-sessions/:id/messages`** – append a new message to the session
  and stream it to connected clients.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L67-L75】
- **`GET /config (runtime config)`** – return the aggregated runtime configuration
  snapshot resolved from `RuntimeConfigDto`.【F:apps/api/src/runtime-config/runtime-config.controller.ts†L20-L27】【F:apps/api/src/runtime-config/dto/runtime-config.dto.ts†L3-L31】
- **`PATCH /config (runtime config)`** – merge partial updates described by
  `UpdateRuntimeConfigDto` and publish a `RuntimeConfigUpdated` event so gateways
  can fan out the change.【F:apps/api/src/runtime-config/runtime-config.controller.ts†L29-L36】【F:apps/api/src/runtime-config/commands/update-runtime-config.handler.ts†L9-L26】
- **`GET /traces`** – list recent trace executions using the CQRS read
  model.【F:apps/api/src/traces/traces.controller.ts†L8-L19】
- **`GET /traces/:id`** – fetch a specific trace by identifier using the query
  bus.【F:apps/api/src/traces/traces.controller.ts†L21-L24】

WebSocket clients can subscribe to `/chat-sessions` to receive real-time events
about session changes and agent activity. The gateway emits:

- `session.created`, `session.updated` – whenever sessions are added or
  archived.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L43-L61】
- `session.deleted` – emitted after a session is removed; clients should drop local copies and active subscriptions when they receive this event.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L43-L61】
- `message.created`, `message.updated` – when chat messages are streamed from
  the engine or edited by follow-up calls.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L63-L69】
  - `agent.activity` – progress updates as the agent executes tools and produces
    responses.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L71-L75】
  - `execution-tree.updated` – full execution tree snapshots emitted by
    `ChatSessionsGateway` whenever the orchestrator publishes a new
    `ExecutionTreeState`. Each payload includes the `sessionId` that triggered the
    update and the nested `agentHierarchy`, `toolInvocations`, and `contextBundles`
    collections that describe which agents spawned children, which tools ran, and
    what artefacts were captured. Client applications reshape the tree into graph
    structures with a `rootNodeId`, flattened `nodes`, and directional `edges` so
    timelines render consistently across dashboards.

    Example websocket payload:

    ```json
    {
      "event": "execution-tree.updated",
      "payload": {
        "sessionId": "session-123",
        "state": {
          "agentHierarchy": [
            { "id": "root-agent", "name": "planner", "children": [] }
          ],
          "toolInvocations": [
            { "id": "call-1", "name": "search", "status": "completed" }
          ],
          "contextBundles": [
            { "id": "bundle-1", "label": "search-results", "sizeBytes": 512 }
          ],
          "agentLineageById": { "root-agent": [] },
          "toolGroupsByAgentId": { "root-agent": ["call-1"] },
          "contextBundlesByAgentId": { "root-agent": ["bundle-1"] },
          "contextBundlesByToolCallId": { "call-1": ["bundle-1"] },
          "createdAt": "2024-01-01T00:00:00.000Z",
          "updatedAt": "2024-01-01T00:00:01.000Z"
        },
        "graph": {
          "rootNodeId": "root-agent",
          "nodes": ["root-agent", "call-1"],
          "edges": [["root-agent", "call-1"]]
        }
      }
    }
    ```

  - `message.send` – inbound websocket command that accepts a
    `SendChatMessagePayloadDto` payload; the gateway forwards it to the command bus
    as `SendChatMessageCommand`.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L77-L92】

Runtime configuration updates stream over `/config`:

- `config.updated` – broadcasts the latest `RuntimeConfigDto` after an update so
  dashboards can refresh their settings view.【F:apps/api/src/runtime-config/runtime-config.gateway.ts†L9-L17】【F:apps/api/src/runtime-config/runtime-config.gateway.events-handler.ts†L7-L23】

Trace activity streams over `/traces`:

- `trace.created`, `trace.updated` – emitted whenever trace commands persist new
  data, allowing visualisers to update timelines without polling.【F:apps/api/src/traces/traces.gateway.ts†L9-L24】【F:apps/api/src/traces/traces.gateway.events-handler.ts†L7-L24】

Tool execution telemetry streams over `/tools`:

- `tool.call`, `tool.result` – payloads are sanitised before broadcast so UIs can
  display tool arguments and results with consistent timestamps.【F:apps/api/src/tools/tools.gateway.ts†L1-L74】【F:apps/api/src/tools/tool-calls-gateway.events-handler.ts†L7-L42】

## Example requests

Interact with the API using standard HTTP and WebSocket tooling:

```bash
# Check API health with the public endpoint
curl http://localhost:4000/health

# Create a chat session and immediately stream updates
curl -X POST http://localhost:4000/chat-sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: $EDDIE_API_KEY" \
  -d '{"title":"Doc sync"}'

# Rename a chat session with the returned identifier
curl -X PATCH http://localhost:4000/chat-sessions/$SESSION_ID \
  -H "Content-Type: application/json" \
  -H "x-api-key: $EDDIE_API_KEY" \
  -d '{
  "name": "Renamed session title"
}'

# Delete a chat session and rely on session.deleted events to fan out state changes
curl -X DELETE http://localhost:4000/chat-sessions/$SESSION_ID \
  -H "x-api-key: $EDDIE_API_KEY"

# Subscribe to agent activity for a session using wscat (trailing slash optional)
wscat --connect ws://localhost:4000/chat-sessions/ \
  --header "x-api-key: $EDDIE_API_KEY"

# Inspect the editable Eddie configuration schema and source
curl -H "x-api-key: $EDDIE_API_KEY" \
  http://localhost:4000/config/schema

# Preview configuration changes before saving them to disk
curl -X POST http://localhost:4000/config/editor/preview \
  -H "Content-Type: application/json" \
  -H "x-api-key: $EDDIE_API_KEY" \
  -d '{"content":"{}","format":"json"}'

# Persist a configuration update
curl -X PUT http://localhost:4000/config/editor \
  -H "Content-Type: application/json" \
  -H "x-api-key: $EDDIE_API_KEY" \
  -d '{"content":"{}","format":"json","path":"./eddie.config.json"}'
```

Connected WebSocket clients receive JSON payloads with `event` and `data` fields
mirroring the gateway events above, allowing dashboards to reflect live agent
progress.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L21-L76】【F:apps/api/src/websocket/utils.ts†L1-L33】

## Configuration Editor

Operate on the running Eddie configuration through the dedicated editor routes:

- **`GET /config/schema`** – return the bundled configuration schema and input
  schema used by the editor UI.【F:apps/api/src/config-editor/config-editor.controller.ts†L14-L24】
- **`GET /config/editor`** – fetch the currently loaded configuration source,
  including parsing results and validation errors.【F:apps/api/src/config-editor/config-editor.controller.ts†L26-L44】
- **`POST /config/editor/preview`** – validate and preview an arbitrary
  configuration payload without persisting it.【F:apps/api/src/config-editor/config-editor.controller.ts†L46-L58】
- **`PUT /config/editor`** – persist configuration changes and return the new
  snapshot from disk. The controller delegates writes to
  `ConfigHotReloadService`, which applies the payload, refreshes the runtime
  snapshot, and publishes a `RuntimeConfigUpdated` event so `/config` websocket
  subscribers receive `config.updated` once the refreshed state is live.【F:apps/api/src/config-editor/config-editor.controller.ts†L60-L78】【F:apps/api/src/config-editor/config-hot-reload.service.ts†L1-L38】【F:apps/api/src/runtime-config/runtime-config.gateway.events-handler.ts†L7-L23】

Subscribe to the `/config` websocket to receive the `config.updated` broadcast
and confirm when the hot reload finishes:

- Keep that websocket connection open while issuing editor requests from
  external tooling so the refresh notification is not missed.
- Review the [Realtime events inventory](./migration/api-realtime-events.md)
  for additional event payload details and subscription options.

## Provider Catalog

Discover supported model providers and identifiers exposed by the API:

- **`GET /providers/catalog`** – list provider names, display labels, and
  available model identifiers for each adapter.【F:apps/api/src/providers/providers.controller.ts†L7-L20】

## User Preferences

Persist lightweight per-user preferences keyed by the caller's API key:

- **`GET /user/preferences/layout`** – resolve the caller's layout preferences,
  defaulting to an anonymous profile when no API key is present.【F:apps/api/src/user-preferences/user-preferences.controller.ts†L14-L28】
- **`PUT /user/preferences/layout`** – update layout settings for the resolved
  user identifier.【F:apps/api/src/user-preferences/user-preferences.controller.ts†L30-L34】

## Logs

Stream structured diagnostics over HTTP or WebSocket to power dashboards and
automations:

- **`GET /logs`** – page through the in-memory ring buffer of log entries using
  `offset` and `limit` query parameters (defaulting to `0` and `50`
  respectively). Responses return arrays of `LogEntryDto` objects as defined in
  `apps/api/src/logs/dto/log-entry.dto.ts`, exposing `id`, `level`, `message`,
  optional `context`, and ISO `createdAt` timestamps.【F:apps/api/src/logs/logs.controller.ts†L11-L18】【F:apps/api/src/logs/dto/log-entry.dto.ts†L1-L16】
- **`POST /logs`** – append a manual diagnostic entry to the buffer and receive
  the resulting `LogEntryDto` payload, useful for probes or scripted smoke
  checks.【F:apps/api/src/logs/logs.controller.ts†L20-L24】

Connect to the `/logs` WebSocket gateway to receive live batches of newly
created entries. The gateway emits messages shaped as
`{ "event": "logs.created", "data": LogEntryDto[] }`, mirroring the REST
payloads for consistent client handling.【F:apps/api/src/logs/logs.gateway.ts†L8-L42】【F:apps/api/src/websocket/utils.ts†L1-L22】

Behind the scenes the `LogsForwarderService` subscribes to both the shared
`LoggerService` and `JsonlWriterService`, normalising their events into
`LogEntryDto` records before forwarding them to the gateway. UI and tooling
consumers can therefore subscribe to `logs.created` to mirror everything the
forwarder captures in real time.【F:apps/api/src/logs/logs-forwarder.service.ts†L1-L118】

## Orchestrator Metadata

Fetch high-level orchestrator state to drive dashboards or debugging tools:

- **`GET /orchestrator/metadata`** – return current orchestrator metadata, with
  an optional `sessionId` query parameter to scope results to a specific chat
  session.【F:apps/api/src/orchestrator/orchestrator.controller.ts†L7-L15】

Snapshots are assembled in `orchestrator.service.ts` using the most recent
`ExecutionTreeState`. When the optional in-memory `ExecutionTreeStateStore`
contains a cached state for the requested session, the service reuses it so the
response mirrors websocket emissions. Otherwise the API replays session data to
rebuild the same `contextBundles`, `toolInvocations`, and `agentHierarchy`
collections before returning. Every response includes a `capturedAt` timestamp
and echoes the `sessionId` when one was supplied.

An example response for `GET /orchestrator/metadata` looks like:

```json
{
  "sessionId": "session-123",
  "capturedAt": "2024-01-01T00:00:01.000Z",
  "contextBundles": [
    {
      "id": "bundle-1",
      "label": "Session history",
      "sizeBytes": 420,
      "fileCount": 0
    }
  ],
  "toolInvocations": [
    {
      "id": "call-1",
      "name": "search",
      "status": "completed",
      "metadata": {
        "agentId": "root-agent",
        "createdAt": "2024-01-01T00:00:00.500Z",
        "updatedAt": "2024-01-01T00:00:01.000Z"
      }
    }
  ],
  "agentHierarchy": [
    {
      "id": "root-agent",
      "name": "planner",
      "provider": "openai",
      "model": "gpt-4.1",
      "depth": 0,
      "children": []
    }
  ]
}
```

When no session is provided, the service emits an empty snapshot with the
current `capturedAt` timestamp so dashboards can still verify connectivity.

### Troubleshooting execution tree telemetry

- Ensure the CQRS `EventBus` remains enabled so
  `ExecutionTreeStateUpdatedEvent` instances reach the websocket handlers;
  disabling the bus prevents `execution-tree.updated` broadcasts entirely.
- Confirm that each orchestrator runtime wires an `ExecutionTreeStateTracker`
  from `platform/runtime/engine/src/execution-tree/execution-tree-tracker.service.ts`.
  Without the tracker, the API cannot persist `agentHierarchy`,
  `toolInvocations`, or `contextBundles` metadata for either the websocket stream
  or metadata endpoint.
- Inspect metadata payloads for agent provider/model pairs and tool invocation
  identifiers. Missing provider names or tool identifiers usually indicates the
  upstream agent descriptors were not supplied to the tracker.

## Telemetry

`main.ts` now consumes `ConfigService` to decide when to boot the OpenTelemetry
SDK and which exporter to use. If telemetry is disabled (the default), tracing
is skipped entirely. When enabled, telemetry shutdown hooks are still wired in,
matching the previous behaviour.

## Middleware Ordering

The bootstrap sequence ensures the HTTP logger middleware runs after logging has
been configured but before any guards, pipes, or interceptors execute. This
keeps request timing accurate while still honouring buffered logger output.
