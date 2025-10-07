# ADR 0001: Extract EngineService Into Dedicated Module Boundary

## Status

Accepted

## Context

The initial Nest refactor left `EngineService`, its options, and result types defined in `src/core/engine.ts` at the root of the `core` module. As additional engine-specific providers (e.g., the `EngineModule`) matured, that flat structure made the dependency graph harder to navigate and complicated tree-shaking. We now maintain other engine concerns inside `src/core/engine/`, so colocating the service aligns with the established folder boundaries.

## Decision

We relocated the `EngineService` implementation—and the `EngineOptions` and `EngineResult` types—into `src/core/engine/engine.service.ts`. A new barrel file at `src/core/engine/index.ts` re-exports those symbols for existing consumers, while the `EngineModule` imports the service locally. Downstream imports (CLI commands, CLI options service, and integration tests) now resolve via the barrel file instead of reaching into a specific file path.

## Consequences

- Engine-related code now lives within a single directory, improving discoverability and keeping Nest module wiring close to the implementation.
- Consumers benefit from a stable module entry point (`src/core/engine`) that hides file structure changes, easing future refactors.
- The structural change required updates to documentation and build metadata, but no runtime behaviour was modified.
