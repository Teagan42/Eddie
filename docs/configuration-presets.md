# Configuration presets

Eddie ships with curated configuration layers that sit between the built-in
defaults and any user-provided overrides. Presets are merged before values from
`eddie.config.*` and before CLI/runtime overrides, which means they provide
opinionated starting points without blocking project-specific tweaks.【F:packages/config/src/config.service.ts†L108-L135】

Presets live in `@eddie/config` under `src/presets` and export partial
`EddieConfigInput` objects. The CLI exposes them through the `--preset` flag and
prints the available names when you request help (`eddie help`).【F:packages/config/src/presets/index.ts†L1-L21】【F:apps/cli/src/cli/cli-runner.service.ts†L66-L92】

## Applying a preset

Use the `--preset` flag to apply a preset to any CLI command:

```bash
eddie ask "Sync local logs" --preset cli-local
```

You can also set `preset` in injected module options when embedding the
configuration service programmatically—for example inside tests or when wiring
custom NestJS modules—because presets are resolved before user overrides in
`ConfigService.compose`.【F:packages/config/src/config.service.ts†L108-L155】

If a preset name is misspelled the service throws a helpful error that lists the
available presets and reminds you to use the `--preset <name>` flag.【F:packages/config/src/config.service.ts†L145-L155】【F:packages/config/test/config.service.test.ts†L148-L154】

## Available presets

### `api-host`

Targets local API hosting scenarios:

- Binds the API to `127.0.0.1` on port `8080` so browser-based clients can reach
  it without elevated privileges.【F:packages/config/src/presets/api-host.ts†L5-L16】
- Enables telemetry with the console exporter for quick diagnostics while
  keeping stack traces gated behind debug logging.【F:packages/config/src/presets/api-host.ts†L9-L12】
- Whitelists `http://localhost:5173` via CORS with credentials enabled so local
  front-ends can make authenticated requests.【F:packages/config/src/presets/api-host.ts†L13-L16】

Pair this preset with a persistent configuration file when you want consistent
API behaviour for local demos or integration testing.

### `cli-local`

Optimises logging for interactive CLI runs:

- Raises the log level to `debug` and sends output to pretty coloured stdout so
  tracing tools stay readable.【F:packages/config/src/presets/cli-local.ts†L4-L12】
- Disables timestamp prefixes to reduce noise in terminal transcripts.【F:packages/config/src/presets/cli-local.ts†L10-L12】
- Keeps streamed JSONL output enabled for trace inspection while preserving the
  pretty interactive stream.【F:packages/config/src/presets/cli-local.ts†L13-L15】

Use `cli-local` together with ad-hoc flags (like `--context` or `--tools`) to
keep local hacking sessions lightweight without losing trace data.
