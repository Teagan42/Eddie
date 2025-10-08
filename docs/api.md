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
    }
  }
}
```

The guard accepts keys from the configuration file, the `EDDIE_API_KEY`/
`EDDIE_API_KEYS` environment variables, or context variables named `apiKeys` or
`API_KEYS`.

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

## Telemetry

`main.ts` now consumes `ConfigService` to decide when to boot the OpenTelemetry
SDK and which exporter to use. If telemetry is disabled (the default), tracing
is skipped entirely. When enabled, telemetry shutdown hooks are still wired in,
matching the previous behaviour.

## Middleware Ordering

The bootstrap sequence ensures the HTTP logger middleware runs after logging has
been configured but before any guards, pipes, or interceptors execute. This
keeps request timing accurate while still honouring buffered logger output.
