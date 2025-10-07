# ADR 0004: Introduce Hooks and Tokenizer Modules with Barrels

## Status

Accepted

## Context

The hooks loader bundled module resolution helpers with the `HooksService`
implementation, leaving the service outside Nest's standard `*.service.ts`
structure. Similarly, the tokenizer logic combined the service with concrete
strategy implementations in a single file without a corresponding module or
barrel export. These layouts made it harder to reason about injectable
providers, complicated future testability, and forced consumers to import from
deep file paths that expose internal organisation details.

## Decision

We relocated `HooksService` into `src/hooks/hooks.service.ts`, created a
`HooksModule`, and introduced a `src/hooks/index.ts` barrel so downstream code
consumes hooks through the directory root. For tokenizers, the strategies now
live in `strategies.ts` while `TokenizerService` resides in
`tokenizer.service.ts`, both managed by a new `TokenizersModule` and exported
via `src/core/tokenizers/index.ts`. Engine consumers now import the modules
instead of direct file paths, and the engine module re-exports the modules for
convenience.

## Consequences

- Hooks and tokenizer services follow Nest conventions, improving discoverability
  and aligning with other modules.
- Barrel files decouple callers from concrete filenames, reducing churn when the
  directories evolve.
- Future extensions—such as additional tokenizer strategies or hook modules—can
  be registered cleanly via their dedicated modules without revisiting the
  engine wiring.
