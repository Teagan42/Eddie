# Engine runtime execution guide

This package houses the CLI execution runtime that powers Eddie's local agent
experience. The `EngineService` entry point stitches together configuration,
context, hooks, providers, tools, transcript compaction, and telemetry to run a
single CLI session end-to-end.

## EngineService CLI sequence

1. **Configuration layering** – `EngineService` obtains a snapshot from
   `ConfigStore`, which is seeded by `ConfigService` during CLI bootstrap. The
   config snapshot already reflects three layers applied by
   `ConfigService.composeLayers`: framework defaults (including preset or
   extension output), then the resolved config file, and finally CLI runtime
   overrides derived from `CliRuntimeOptions`. Runtime invocations may still
   pass `EngineOptions` (history, auto-approve, non-interactive) that are applied
   purely in-memory.
2. **Hook lifecycle** – The engine loads hook modules through `HooksService` and
   then emits lifecycle events in a fixed order:
   `sessionStart → beforeContextPack → afterContextPack → userPromptSubmit →
   sessionEnd`. Compactor-specific hooks (`preCompact`) are dispatched on demand
   during transcript maintenance.
3. **Context packing** – `ContextService.pack` builds the prompt context. Before
   handing it off, the engine discovers any MCP resources and merges them into
   the packed context while respecting byte limits.
4. **MCP tool/resource discovery** – `McpToolSourceService.collectTools` queries
   configured sources, returning additional tools, resources, and prompts.
   Resources are converted to `PackedResource` entries and appended to the
   context. Remote tools are merged with `builtinTools`, filtered through the
   enabled/disabled lists, and then exposed to the agent catalog.
5. **Provider hand-off** – `buildAgentCatalog` composes `AgentRuntimeDescriptor`
   entries for the manager and any subagents. Provider configuration is resolved
   via `resolveAgentProviderConfig`, adapter instances are created lazily through
   `ProviderFactoryService.create`, and descriptors cache adapters per provider
   config to avoid redundant instantiation. The resulting catalog, along with
   hook bus, confirmation adapter, transcript selector, metrics handle, and
   tracing options, is passed to `AgentOrchestratorService.runAgent`.
6. **Result finalisation** – Once the orchestrator finishes, `EngineService`
   collects invocations, emits `sessionEnd`, and returns the `EngineResult` with
   messages, context, trace path, and invocation tree metadata.

### MCP resource merging

When MCP discovery yields resources, `EngineService` converts them into packed
resources with stable identifiers (`mcp:<sourceId>:<resource>`), copies metadata,
and appends their rendered sections to `PackedContext.text` while ensuring the
context `maxBytes` limit is respected. Rejected resources are logged with byte
usage diagnostics so hook authors can react via tracing.

## Transcript compaction workflow

`TranscriptCompactionService` coordinates how agent transcripts are trimmed or
preserved during long-running conversations:

- **Selector creation** – `createSelector` reads the active `EddieConfig`
  snapshot and precomputes a map of per-agent `TranscriptCompactorConfig`
  overrides. Global defaults come from `config.transcript.compactor`, while
  agent-specific overrides are sourced from the manager and each subagent.
- **Compactor resolution** – `selectFor` chooses a compactor per invocation. It
  prefers a matching agent override; otherwise it falls back to the global
  configuration. Absent either layer, transcript compaction is disabled for that
  invocation. Instances are cached per agent/signature, and the cache is cleared
  whenever the underlying config store emits a new snapshot via the
  `TRANSCRIPT_COMPACTOR_FACTORY` binding.
- **Planning and hooks** – `planAndApply` delegates to the compactor's `plan`
  method, emits `HOOK_EVENTS.preCompact` before applying mutations, and logs the
  outcome (including removed message counts) for observability. The workflow can
  also expose the complete, un-compacted history through `getFullHistoryFor`
  when a compactor implements `getFullHistory`.

## Telemetry and metrics integration

Telemetry is surfaced through `MetricsService`, which wraps pluggable backends
and maintains in-memory snapshots for tests and diagnostics.

- **Backends** – `metricsProviders` register `METRICS_BACKEND`, selecting between
  `LoggingMetricsBackend` (human-readable counters/histograms),
  `OtelMetricsBackend` (OpenTelemetry meters via `METRICS_METER_PROVIDER`), or a
  no-op backend when none is configured. The backend choice is derived from the
  active `MetricsConfig` in `ConfigStore`.
- **Namespacing** – Metric names are prefixed with namespaces from
  `METRICS_NAMESPACES`, defaulting to `engine.messages`, `engine.tools`,
  `engine.errors`, and `engine.timers`. Custom namespaces can be injected via
  module configuration.
- **Snapshot support** – `MetricsService.countMessage`, `.observeToolCall`, and
  `.countError` increment counters while persisting totals in a local map. The
  `timeOperation` helper records timer histograms using `performance.now()` and
  exposes duration data via `.snapshot()`. Tests and diagnostics can call
  `.reset()` to clear accumulated state, while module shutdown propagates through
  backend `shutdown` hooks for graceful Otel flushes.

Together, these components give CLI sessions consistent observability and
transcript hygiene while preserving extensibility through hooks, providers, and
metrics bindings.
