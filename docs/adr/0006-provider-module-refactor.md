# ADR 0006: Introduce ProvidersModule for ProviderFactory

## Status

Accepted

## Context

`ProviderFactory` lived directly inside `src/core/providers/index.ts` where it
was both implemented and exported. As more modules consume the factory, the lack
of a dedicated Nest module made dependency wiring fragile. The engine module had
to list the factory in its own providers array, and other modules would need to
repeat that pattern or reach into internal paths. This structure created tight
coupling to file layouts and complicated future provider-related dependencies.

## Decision

We extracted `ProviderFactory` into `provider-factory.service.ts` and created a
new `ProvidersModule` that provides and exports the service. The providers index
was converted into a barrel file that re-exports the service and module. The
engine module now imports `ProvidersModule` and references the service from its
new file path, ensuring DI consistency.

## Consequences

- Other modules can import `ProvidersModule` to gain access to `ProviderFactory`
  without redefining providers or deep-linking into internal files.
- The provider layer mirrors the module boundaries used elsewhere in the codebase,
  improving readability and consistency.
- Future provider services can register within `ProvidersModule`, consolidating
  provider-related wiring and simplifying testing overrides.
