# ADR 0005: Encapsulate CLI Providers in CliModule

## Status

Accepted

## Context

The CLI services and command implementations lived directly in the root
application module. That arrangement blurred module boundaries, made it harder
for tests to stand up only the CLI surface, and required downstream callers to
import individual services from deep file paths. As the CLI grows, the lack of a
module boundary complicates dependency management and violates Nest's modular
conventions.

## Decision

We introduced a dedicated `CliModule` under `src/cli/cli.module.ts`. The module
imports the configuration, context, engine, IO, and tokenizer modules to satisfy
command dependencies. It provides the CLI option parser, runner, and each
command, exporting only the `CliRunnerService` for bootstrap code. A barrel file
at `src/cli/index.ts` now re-exports the module, services, and command types so
callers can reference the CLI surface without deep relative paths.

## Consequences

- `AppModule` consumes the CLI through the new module import, reducing provider
  noise and clarifying wiring at the top level.
- Tests instantiate `CliModule` directly, giving them parity with the runtime
  dependency graph and simplifying overrides for specific providers.
- Future CLI additions can register their providers within `CliModule`, keeping
  the CLI cohesive and preventing regressions when wiring changes.
