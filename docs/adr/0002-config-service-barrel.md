# ADR 0002: Align Config Service Naming and Module Exports

## Status

Accepted

## Context

The configuration layer previously lived in `src/config/loader.ts`, a filename that
predated our adoption of Nest-style service naming. As our modules and tests evolved,
imports reached directly into that file. The mismatch between the service name and the
file path caused confusion, especially for developers expecting the conventional
`*.service.ts` layout, and complicated future refactors because each consumer hard-coded
the file name.

## Decision

We renamed `src/config/loader.ts` to `src/config/config.service.ts` while preserving the
`ConfigService` implementation. The `ConfigModule` now imports the service from the new
file, and a barrel file at `src/config/index.ts` re-exports the service so downstream
consumers can reference the module directory instead of a specific file path. All usage
sites—including CLI commands, the engine, and integration tests—now import `ConfigService`
from the barrel.

## Consequences

- The configuration module now follows Nest naming conventions, improving discoverability
  for new contributors and matching other services in the codebase.
- Future file reorganisations can happen behind the barrel without requiring broad import
  rewrites across commands and tests.
- Documentation and tooling references needed a minor update, but runtime behaviour
  remains unchanged.
