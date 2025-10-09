# API App Contribution Guide

This document outlines how to work within the NestJS API located under `apps/api`. Follow these conventions whenever you add or modify code in this package.

## Module Layout & Structure
- **Root module**: keep application-wide wiring in `src/api.module.ts`. Feature areas (auth, chat sessions, user preferences, orchestration, etc.) should each expose their own module in `src/<feature>/*.module.ts` (for example, `src/auth/auth.module.ts`). Import feature modules into `ApiModule` and avoid circular dependencies.
- **Feature boundaries**: collocate controllers, services, DTOs, and providers under their feature directory. Re-export feature providers through the module to keep DI graphs explicit.
- **Shared utilities**: if a provider is reused across features (e.g., caching, logging interceptors), surface them from a shared module rather than reaching across features directly.

## Dependency Injection Practices
- Register injectable classes with the `@Injectable()` decorator and provide them through their owning feature module. Prefer constructor injection over property injection and keep providers stateless where possible.
- When injecting configuration or constants, define tokens in `src/runtime-config` (see `runtime-config.module.ts` and companions) and use `@Inject(token)` to consume them.
- Use factory providers for dynamic dependencies (HTTP clients, SDK instances). Co-locate factories beside the feature that owns them and ensure their lifecycle is handled through module scopes (singleton by default unless the scope must differ).

## Middleware
- Global middleware is registered in `src/middleware/index.ts` and applied from `src/main.ts`. Add cross-cutting middleware (e.g., logging, request correlation) here.
- For scoped middleware, declare it within the feature module implementing `NestModule` and wire it up in the module's `configure` method.

## Exception Filters
- Use `src/http-exception.filter.ts` as the global exception filter. Extend this filter or create feature-scoped filters when a bounded context needs specialised error shaping. Register custom filters via `app.useGlobalFilters` in `main.ts` or in feature modules as needed.

## Pipes
- Default validation lives in `src/validation.pipe.ts`. Apply it globally in `main.ts`. Feature-specific transformation or validation pipes should be provided in their respective modules and applied through controller-scoped or route-scoped decorators.

## Guards
- Authentication and authorisation guards reside under `src/auth` (e.g., `auth.guard.ts`). Register global guards in `main.ts` or module providers when every route requires them. For targeted protection, attach guards with `@UseGuards` at the controller or route level.

## Interceptors
- Common interceptors such as caching (`src/cache.interceptor.ts`) and structured logging (`src/logging.interceptor.ts`) are applied globally in `main.ts`. Add new interceptors for cross-cutting concerns (metrics, response shaping) and register them either globally or per-controller using `@UseInterceptors`.

## Custom Decorators
- Place reusable parameter or method decorators under `src/<feature>/decorators` (create the directory if missing). Ensure each decorator is well-tested and documented, especially when it interacts with guards, pipes, or interceptors.

## Testing Expectations
- All tests run through Vitest with the configuration defined in `apps/api/vitest.config.ts`. Add unit tests under `apps/api/test/unit` and integration tests under `apps/api/test/integration`. Mirror real HTTP flows using Nest's testing utilities and supertest where appropriate.

## REST & OpenAPI Tooling
- Keep controllers RESTful: HTTP verbs should map to resource actions, DTOs must live with their feature. Update the OpenAPI schema helpers in `src/openapi.ts` and `src/openapi.module.ts` whenever routes, DTOs, or auth flows change. Use `SwaggerModule` setup in `main.ts` as the reference point for documentation wiring.

## Telemetry, Logging, and Runtime Configuration
- Telemetry hooks live under `src/telemetry`; extend these utilities when emitting new metrics or traces. Structured logging utilities are under `src/logs` and `src/logging.interceptor.ts`—reuse existing loggers to maintain consistent correlation IDs.
- Runtime configuration utilities (module, service, tokens) live in `src/runtime-config`. When adding new environment-driven values, define them in the config schema, expose them through the config service, and document defaults in `.env.example` (if applicable).
- For request tracing and persistence, see `src/traces` and `src/logs` for patterns on where to plug in additional emitters or sinks.

Adhering to these guidelines keeps the API consistent, testable, and observability-friendly.
