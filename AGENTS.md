# Eddie Agents Overview

Eddie acts as a command-line facilitator for agentic AI workflows. This document explains the moving pieces so future features or new agents can be added confidently.

## High-Level Architecture

```
CLI (commander)
  ├─ ask/run/chat/context/trace commands
  └─ resolveCliOptions → Engine
Engine (src/core/engine)
  ├─ loadConfig → config/config.service.ts (merges defaults + file + CLI flags)
  ├─ ContextService → core/context/context.service.ts (glob, ignore, budgets)
  ├─ makeProvider → core/providers/* (adapter pattern)
  ├─ ToolRegistry → core/tools/* (AJV validated tool calls)
  ├─ stream loop → handles deltas, tool calls, traces, hooks
  └─ initLogging → io/logger.service.ts (per-run structured logging)
```

Key flows:

1. **Command Entry** – Commands collect flags, pass them through `resolveCliOptions`, and call the engine.
2. **Configuration Layering** – `loadConfig` merges defaults (`DEFAULT_CONFIG`), optional YAML/JSON configs, and CLI overrides, yielding a typed `EddieConfig` used everywhere.
3. **Context Packing** – `packContext` resolves globs relative to `context.baseDir`, enforces `maxFiles/maxBytes`, and produces both file metadata and a stitched text payload. It logs budget decisions with a scoped logger.
4. **Provider Abstraction** – `core/providers` exposes OpenAI, Anthropic, and generic OpenAI-compatible adapters, each yielding `StreamEvent`s with deltas, tool calls, and errors.
5. **Tool Loop** – Tool calls stream from providers, are validated via AJV schemas in `ToolRegistry`, and dispatched to built-ins (`bash`, `file_read`, `file_write`). Confirmation prompts are mediated through `io/confirm.service` and respect `--auto-approve`/`--non-interactive` flags.
6. **Observability** – `io/logger.service` centralises logging configuration (stdout/stderr/file with optional pretty transport). The engine writes JSONL traces, while hooks can emit additional telemetry.

## Agents & Hooks

The runtime treats each provider invocation as an “agent execution”:

- The `engine` maintains a message history and re-asks the provider whenever a tool call is fulfilled, mirroring the agentic loop popularised by IDE copilots.
- Hooks (loaded via `hooks/hooks-loader.service.ts`) allow external agents to subscribe to lifecycle events such as `beforeModelCall`, `onToolCall`, or `onComplete`, enabling custom metrics, approvals, or policy enforcement.

To add a new agent mode:

1. Define a new CLI command (or extend `chat/run`) that prepares specialised history/flags.
2. Provide an adapter implementing the `ProviderAdapter` interface if the agent talks to a new API.
3. Optionally register additional tools via `ToolRegistry.register` or through hook modules.

## Patterns and Considerations

- **Adapter Pattern** – Providers conform to `ProviderAdapter`, isolating API quirks (stream formats, tool-call semantics).
- **Dependency Injection via Config** – Configuration objects flow from CLI → engine → subsystems, avoiding global state besides the logger singleton.
- **Functional Core / Imperative Shell** – Pure data transforms (context packing, config merge) feed into side-effecting loops (streaming, file IO), simplifying tests.
- **Structured Logging** – `initLogging` must be called once per command; scoped loggers (`getLogger("engine")`) tag events for later filtering.
- **Extensibility Hooks** – Hook bus uses Node’s `EventEmitter`; modules can export an installer function or an event map, making composition dead-simple.

## Implementation Notes

- Tests live under `test/unit` and rely on Vitest; add fixtures for providers/tools as new behaviours land.
- When writing new adapters, follow the existing ones: parse streaming payloads incrementally and normalise into `StreamEvent` objects.
- Tool authors should return concise payloads; heavy binary outputs should be redirected to files and referenced in the tool result string.
- Write tests alongside every code change, preferring realistic data that mirrors production usage (e.g., representative file contents, plausible API payloads).

## Contribution Workflow

- Use a new branch for a series of tasks following the pattern `codex/$description`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit (e.g., `feat: add foo support`, `fix: handle bar edge case`), keep commits atomic, and group related work logically: documentation, scaffolding, refactor, logic/feature, bugs, test.
- Capture any significant architectural or design decision in an ADR placed under `adr/` (one file per decision, numbered chronologically).
- Add or update test cases for all behaviour changes; ensure fixtures resemble real-world inputs so regressions surface quickly - add any necessary devDependencies to package.json.
- Ensure all code follows proper documentation standards for Typescript.

By adhering to these conventions, Eddie stays maintainable while acting as a flexible agent host for future LLM integrations.
