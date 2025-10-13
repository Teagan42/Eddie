# Eddie API

The Eddie API wraps the engine in a NestJS HTTP server that exposes health
checks today and leaves room for future automation endpoints. The module now
ships with a set of global providers to ensure consistent behaviour across
routes.

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

## Configuration

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
    }
  }
}
```

The guard accepts keys from the configuration file, the `EDDIE_API_KEY`/
`EDDIE_API_KEYS` environment variables, or context variables named `apiKeys` or
`API_KEYS`.

Set `api.persistence.driver` to `"memory"` (default) to keep the in-memory
repository for ephemeral testing, or `"sqlite"` to persist chat sessions and
messages to disk. When using SQLite you can override the storage location via
`api.persistence.sqlite.filename`.

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
- **`PATCH /chat-sessions/:id/archive`** – archive a session and keep historical
  records immutable.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L51-L57】
- **`GET /chat-sessions/:id/messages`** – list all recorded messages for a
  session.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L59-L65】
- **`POST /chat-sessions/:id/messages`** – append a new message to the session
  and stream it to connected clients.【F:apps/api/src/chat-sessions/chat-sessions.controller.ts†L67-L75】

WebSocket clients can subscribe to `/chat-sessions` to receive real-time events
about session changes and agent activity. The gateway emits:

- `session.created`, `session.updated` – whenever sessions are added or
  archived.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L43-L61】
- `message.created`, `message.updated` – when chat messages are streamed from
  the engine or edited by follow-up calls.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L63-L69】
- `agent.activity` – progress updates as the agent executes tools and produces
  responses.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L71-L75】

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

# Subscribe to agent activity for a session using wscat (trailing slash optional)
wscat --connect ws://localhost:4000/chat-sessions/ \
  --header "x-api-key: $EDDIE_API_KEY"
```

Connected WebSocket clients receive JSON payloads with `event` and `data` fields
mirroring the gateway events above, allowing dashboards to reflect live agent
progress.【F:apps/api/src/chat-sessions/chat-sessions.gateway.ts†L21-L76】【F:apps/api/src/websocket/utils.ts†L1-L33】

## Telemetry

`main.ts` now consumes `ConfigService` to decide when to boot the OpenTelemetry
SDK and which exporter to use. If telemetry is disabled (the default), tracing
is skipped entirely. When enabled, telemetry shutdown hooks are still wired in,
matching the previous behaviour.

## Middleware Ordering

The bootstrap sequence ensures the HTTP logger middleware runs after logging has
been configured but before any guards, pipes, or interceptors execute. This
keeps request timing accurate while still honouring buffered logger output.
