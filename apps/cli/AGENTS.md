# Eddie CLI Architecture & Testing Guide

The CLI orchestrates Eddie's agent workflows and wires runtime services together. Use this guide when touching files under `apps/cli` or the shared core it exercises.

## High-Level Architecture

```
CLI (CliRunnerService → CliParserService)
  ├─ ask/run/chat/context/trace commands
  └─ CliOptionsService.parse → Engine
Engine (src/core/engine)
  ├─ loadConfig → config/config.service.ts (merges defaults + file + CLI flags)
  ├─ ContextService → core/context/context.service.ts (glob, ignore, budgets)
  ├─ makeProvider → core/providers/* (adapter pattern)
  ├─ ToolRegistry → core/tools/* (AJV validated tool calls)
  ├─ stream loop → handles deltas, tool calls, traces, hooks
  └─ LoggerService.configure → io/logger.service.ts (per-run structured logging)
```

### Key Flows

1. **Command Entry** – Commands collect flags, pass them through `CliOptionsService.parse`, and call the engine.
2. **Configuration Layering** – `loadConfig` merges defaults (`DEFAULT_CONFIG`), optional YAML/JSON configs, and CLI overrides, yielding a typed `EddieConfig` used everywhere.
3. **Context Packing** – `packContext` resolves globs relative to `context.baseDir`, enforces `maxFiles/maxBytes`, and produces both file metadata and a stitched text payload. It logs budget decisions with a scoped logger.
4. **Provider Abstraction** – `core/providers` exposes OpenAI, Anthropic, and generic OpenAI-compatible adapters, each yielding `StreamEvent`s with deltas, tool calls, and errors.
5. **Tool Loop** – Tool calls stream from providers, are validated via AJV schemas in `ToolRegistry`, and dispatched to built-ins (`bash`, `file_read`, `file_write`). Confirmation prompts are mediated through `io/confirm.service` and respect `--auto-approve`/`--non-interactive` flags.
6. **Observability** – `io/logger.service` centralises logging configuration (stdout/stderr/file with optional pretty transport). The engine writes JSONL traces, while hooks can emit additional telemetry.

### Patterns and Considerations

- **Adapter Pattern** – Providers conform to `ProviderAdapter`, isolating API quirks (stream formats, tool-call semantics).
- **Dependency Injection via Config** – Configuration objects flow from CLI → engine → subsystems, avoiding global state besides the logger singleton.
- **Functional Core / Imperative Shell** – Pure data transforms (context packing, config merge) feed into side-effecting loops (streaming, file IO), simplifying tests.
- **Structured Logging** – `LoggerService.configure` must be called once per command; scoped loggers (`getLogger("engine")`) tag events for later filtering.
- **Extensibility Hooks** – Hook bus uses Node’s `EventEmitter`; modules can export an installer function or an event map, making composition dead-simple.

## Testing Expectations

- Tests live under `test/unit` and `test/integration`, both powered by Vitest. Add isolated logic specs to `test/unit`, and cover multi-service flows or CLI wiring in `test/integration` with realistic fixtures mirroring scenarios such as `test/integration/cli-runner.integration.test.ts`.
- When writing new adapters, follow the existing ones: parse streaming payloads incrementally and normalise into `StreamEvent` objects.
- Tool authors should return concise payloads; heavy binary outputs should be redirected to files and referenced in the tool result string.
- Write tests alongside every code change, preferring realistic data that mirrors production usage (e.g., representative file contents, plausible API payloads).

These practices keep the CLI stable while enabling new agent modes and provider integrations with confidence.
