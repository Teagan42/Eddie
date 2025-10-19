# @eddie/config configuration guide

The `@eddie/config` package centralises runtime configuration for Eddie's CLI
and API surfaces. It exposes a Nest-compatible `ConfigModule` that can also be
consumed directly in plain TypeScript contexts.

## Module structure

`ConfigModule` is built with the Nest configurable module pattern. Importing the
module registers the following exported providers:

- **`ConfigService`** – merges defaults, file state, and runtime overrides while
  exposing helpers for retrieving typed configuration slices.
- **`ConfigWatcher`** – subscribes to file changes and emits updates so CLI and
  API hosts can reload configuration without restarts.
- **`ConfigStore`** – persists resolved configuration snapshots and exposes
  helper methods for migrations and extension lifecycle hooks.

Consumers can inject the providers directly or import the module inside a Nest
application. The CLI bootstraps `ConfigModule` through the workspace bootstrap
sequence, while the API plugs it into the root `AppModule` to reuse the same
validation and watcher stack.

## Configuration layering pipeline

Configuration is resolved by applying layers in the following order:

1. **Defaults** – static schema-backed defaults provide a baseline for every
   option.
2. **File** – the active configuration file (YAML or JSON) overrides defaults.
   On load the `ConfigStore` runs migrations, ensuring legacy keys are upgraded
   to the latest schema version.
3. **CLI overrides** – runtime arguments parsed from the CLI surface take final
   precedence.

In short: **defaults → file → CLI overrides**.

After layering, presets are applied to inject opinionated bundles of settings
(e.g. provider templates). Extension manifests can register additional schema
segments and load-time transforms; the module coordinates this by exposing the
`ConfigStore` hooks to extension packages.

## Runtime override helpers

`parseCliRuntimeOptionsFromArgv` converts CLI arguments into the override layer
consumed by the module. Metrics-related flags are validated up front so invalid
combinations fail fast before bootstrapping completes. When adding new runtime
switches, update the parser and validation helpers to ensure they surface in the
override payload that `ConfigService` receives.

## Watcher behaviour and persistence hooks

`ConfigWatcher` observes the resolved configuration file path and replays the
layering pipeline whenever the file changes. It debounces writes, re-applies
migrations, reloads extension contributions, and re-emits presets so consumers
always receive a consistent snapshot. Hosts can subscribe to watcher events to
persist derived state or trigger follow-up actions. Implement new persistence
hooks by extending `ConfigStore`, ensuring they remain idempotent to avoid
conflicts during rapid reloads.
