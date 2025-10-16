# Packages Contribution Guide

This guide captures shared expectations for packages housed under `platform/`.
Use it whenever you add a new library or update existing ones so the CLI and
application layers remain consistent. Pair it with the
[Dependency Injection Best Practices](../docs/di-best-practices.md) guide for
concrete constructor, token, and testing examples drawn from the shared
packages.

## Library Patterns

### NestJS-Compatible Services
- Surface injectable classes via the `@Injectable()` decorator and export their
  providers through a `Module` factory (e.g. `createFooModule()`), keeping the
  NestJS dependency optional. Accept plain constructor arguments so the service
  can be consumed outside Nest as a simple class.
- Configuration should flow through typed interfaces and be provided via
  dependency injection tokens. Avoid reading from environment variables inside
  package code; instead, expect the hosting application to supply configuration.
- When exposing middleware, pipes, guards, interceptors, or filters, provide a
  functional factory (`createLoggingInterceptor(options)`) alongside the
  NestJS-specific wrapper so non-Nest consumers can reuse the same logic.

### Streaming Engine Contracts
- Implement engine-related packages against the `StreamEvent` contract defined
  in `@eddie/core`. Emit events as async iterables to support incremental
  consumption. Document ordering guarantees and error propagation semantics.
- Keep transport adapters pure: translate provider responses into domain events
  without performing side effects. Leave logging or persistence to the host
  application via hooks or injected callbacks.

### Tool Registry Usage
- Register tools by exporting metadata objects that conform to the shared
  `ToolDefinition` type. Validation schemas should be declared once and reused
  across runtime and tests to prevent divergence.
- Tool implementations must be idempotent and avoid mutating global state.
  Where state is required (e.g. file system writes), expose explicit interfaces
  so the CLI or hosting service can supply sandboxed adapters.

## Testing Strategy
- Use Vitest for all package-level tests. Unit tests belong in `__tests__/` or
  alongside implementation files using the `.test.ts` suffix.
- Mock external providers (HTTP, file IO) with lightweight fakes. Prefer
  contract tests that verify streaming behaviour via async iterator snapshots.
- Ensure shared types remain framework-agnostic. Tests should import shared
  DTOs or interfaces directly and assert they work in plain TypeScript contexts
  without NestJS helpers.

## Dependency Boundaries
- Packages may depend on siblings only through published entry points. Avoid
  deep imports (e.g. `@eddie/core/dist/...`); instead, rely on the public API of
  each package.
- Shared types live in base utility packages (e.g. `@eddie/core`). Higher-level
  packages can depend on lower-level ones, but never the inverse. Document any
  new dependency edges in the package README.
- When updating a public API, treat the change as breaking unless backwards
  compatibility is explicitly maintained. Provide migration guidance in
  `CHANGELOG.md` and update affected integration tests. Deprecate APIs with
  runtime warnings before removal whenever feasible.
