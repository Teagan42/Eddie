# Configuration presets

Eddie ships with curated configuration layers that sit between the built-in
defaults and any user-provided overrides. Presets are merged before values from
`eddie.config.*` and before CLI/runtime overrides, which means they provide
opinionated starting points without blocking project-specific tweaks.【F:platform/core/config/src/config.service.ts†L108-L135】

Presets live in `@eddie/config` under `src/presets` and export partial
`EddieConfigInput` objects. The CLI exposes them through the `--preset` flag and
prints the available names when you request help (`eddie help`).【F:platform/core/config/src/presets/index.ts†L1-L21】【F:apps/cli/src/cli/cli-runner.service.ts†L66-L92】

## Applying a preset

Use the `--preset` flag to apply a preset to any CLI command:

```bash
eddie ask "Sync local logs" --preset cli-local
```

You can also set `preset` in injected module options when embedding the
configuration service programmatically—for example inside tests or when wiring
custom NestJS modules—because presets are resolved before user overrides in
`ConfigService.compose`.【F:platform/core/config/src/config.service.ts†L108-L155】

If a preset name is misspelled the service throws a helpful error that lists the
available presets and reminds you to use the `--preset <name>` flag.【F:platform/core/config/src/config.service.ts†L145-L155】【F:platform/core/config/test/config.service.test.ts†L148-L154】

## Available presets

### `api-host`

Targets local API hosting scenarios:

- Binds the API to `127.0.0.1` on port `8080` so browser-based clients can reach
  it without elevated privileges.【F:platform/core/config/src/presets/api-host.ts†L5-L16】
- Enables telemetry with the console exporter for quick diagnostics while
  keeping stack traces gated behind debug logging.【F:platform/core/config/src/presets/api-host.ts†L9-L12】
- Whitelists `http://localhost:5173` via CORS with credentials enabled so local
  front-ends can make authenticated requests.【F:platform/core/config/src/presets/api-host.ts†L13-L16】

Pair this preset with a persistent configuration file when you want consistent
API behaviour for local demos or integration testing.

### `cli-local`

Optimises logging for interactive CLI runs:

- Raises the log level to `debug` and sends output to pretty coloured stdout so
  tracing tools stay readable.【F:platform/core/config/src/presets/cli-local.ts†L4-L12】
- Disables timestamp prefixes to reduce noise in terminal transcripts.【F:platform/core/config/src/presets/cli-local.ts†L10-L12】
- Keeps streamed JSONL output enabled for trace inspection while preserving the
  pretty interactive stream.【F:platform/core/config/src/presets/cli-local.ts†L13-L15】

Use `cli-local` together with ad-hoc flags (like `--context` or `--tools`) to
keep local hacking sessions lightweight without losing trace data.

### `demo-screenshots`

Primes the API with a deterministic dataset for screenshot capture and docs
reviews:

- Enables the in-memory persistence driver so fixtures can be seeded and reset
  quickly.【F:platform/core/config/src/presets/demo-screenshots.ts†L5-L12】
- Points `api.demo.fixtures.path` at the shared `overview-demo.json` dataset so
  chat sessions, traces, logs, and runtime config are hydrated automatically on
  boot.【F:platform/core/config/src/presets/demo-screenshots.ts†L13-L19】
- Turns on the `api.demo.enabled` switch so the loader runs without additional
  CLI flags.【F:platform/core/config/src/presets/demo-screenshots.ts†L5-L19】

Use this preset together with `npm run dev -- --preset demo-screenshots` to
start the API populated with the fixtures exported from `apps/api/demo/fixtures`.
The preset can also be supplied to tests via `CliRuntimeOptions` when you need a
stable dataset for integration snapshots.【F:apps/api/test/integration/demo-fixtures/demo-fixtures.integration.test.ts†L164-L179】
