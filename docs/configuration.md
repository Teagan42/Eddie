# Eddie configuration

Eddie's runtime is driven by a strongly typed JSON schema that governs the
`eddie.config.*` files consumed by the CLI, API, and supporting tooling. Use the
configuration reference below to explore how sections such as `agents`,
`provider`, and `tools` fit together.

## Schema visualization

The configuration schema diagram is generated automatically from the
`EDDIE_CONFIG_SCHEMA_BUNDLE` source of truth. Run `npm run docs:config-schema`
to regenerate it after making schema changes.

- [View the Mermaid diagram](./generated/config-schema-diagram.md)
- [`platform/core/config/scripts/render-config-schema-diagram.ts`](../platform/core/config/scripts/render-config-schema-diagram.ts)

## Metrics configuration

The `metrics` section controls which backend the runtime uses when publishing counters and histograms. By default Eddie ships with the noop backend so installations without observability requirements incur no logging overhead.【F:platform/core/config/src/defaults.ts†L99-L101】【F:platform/runtime/engine/src/telemetry/metrics.service.ts†L103-L118】 The configuration schema accepts two backend types.【F:platform/core/config/src/schema.ts†L222-L249】

- `noop` – disables metrics emission entirely.【F:platform/core/config/src/schema.ts†L222-L229】
- `logging` – instantiates the `LoggingMetricsBackend`, which records metrics through the Nest logger. You can set `metrics.backend.level` to `debug`, `log`, or `verbose` to control which logger method is invoked; when omitted the backend falls back to `debug`.【F:platform/core/types/src/config.ts†L133-L150】【F:platform/runtime/engine/src/telemetry/logging-metrics.backend.ts†L5-L43】

Runtime overrides such as `--metrics-backend` and `--metrics-backend-level` flow through `CliRuntimeOptions`, so CLI flags and environment variables can switch the backend per run without editing configuration files.【F:platform/core/types/src/config.ts†L347-L362】【F:platform/core/config/src/config.service.ts†L600-L653】【F:platform/core/config/src/runtime-env.ts†L71-L168】

When opting into the OpenTelemetry backend, supply a configured `MeterProvider` through the `METRICS_METER_PROVIDER` injection token so the engine can reuse your SDK instance instead of the global singleton.【F:platform/runtime/engine/src/telemetry/metrics.service.ts†L35-L40】【F:platform/runtime/engine/src/telemetry/metrics.service.ts†L141-L159】 Doing so allows the runtime to flush and shut down the provider during Nest module teardown, ensuring buffered metrics drain cleanly.【F:platform/runtime/engine/src/telemetry/otel-metrics.backend.ts†L37-L69】
