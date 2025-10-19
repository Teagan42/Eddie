# Eddie configuration

Eddie's runtime is driven by a strongly typed JSON schema that governs the
`eddie.config.*` files consumed by the CLI, API, and supporting tooling. Use the
configuration reference below to explore how sections such as `agents`,
`provider`, and `tools` fit together.

If you're starting from scratch, run [`eddie config`](./cli-reference.md#config-command)
to launch the configuration wizard, then follow the [wizard guide](./configuration-wizard.md)
for deeper walkthroughs before refining values by hand.

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

## Transcript Compaction

Add a `transcript.compactor` block when you need the runtime to automatically trim or summarize agent history before each model call. The global configuration under `transcript.compactor` applies to every agent unless a manager or subagent supplies a `transcript.compactor` override inside its own `transcript` section.【F:platform/runtime/engine/src/transcript/transcript-compaction.service.ts†L61-L88】 The engine caches instantiated compactors, and when the configuration store publishes a new snapshot the engine reloads compaction strategies by clearing that cache and rebuilding them so updates take effect without a restart.【F:platform/runtime/engine/src/transcript/transcript-compaction.service.ts†L36-L59】

During every iteration the agent run loop measures the time spent compacting (`transcript.compaction`) and fires the `preCompact` lifecycle hook before mutating the transcript, giving operators traceable metrics and hook payloads when compaction occurs.【F:platform/runtime/engine/src/agents/runner/agent-run-loop.ts†L43-L75】【F:platform/runtime/engine/src/transcript/transcript-compaction.service.ts†L101-L144】【F:platform/core/types/src/hooks.ts†L23-L213】 Attach an observability module to `HOOK_EVENTS.preCompact` or inspect the transcript compaction metric to understand when history was trimmed.

### Built-in strategies

| Strategy | Intent | Tunable fields | External dependencies |
| --- | --- | --- | --- |
| `simple` | Discards the oldest non-system messages once the transcript exceeds a fixed length, while keeping recent exchanges and all system prompts.【F:platform/runtime/engine/src/transcript-compactors/simple-transcript-compactor.ts†L17-L74】 | `maxMessages` caps the total transcript size; `keepLast` pins the newest messages in place.【F:platform/core/types/src/config.ts†L236-L245】 | None. |
| `summarizer` | Summarizes a sliding history window into a single assistant message when the transcript grows too large, optionally delegating summary generation to an HTTP endpoint.【F:platform/runtime/engine/src/transcript-compactors/summarizing-transcript-compactor.ts†L14-L116】【F:platform/runtime/engine/src/transcript-compactors/summarizing-transcript-compactor.ts†L203-L305】 | `maxMessages` and `windowSize` bound the window, `label` controls the summary heading, and the nested `http` block configures `url`, `method`, `headers`, and `timeoutMs` for remote summarization.【F:platform/core/types/src/config.ts†L247-L264】 | Provide an HTTPS endpoint that accepts `{ agentId, messages }` JSON and returns a summary string when the `http` block is present.【F:platform/runtime/engine/src/transcript-compactors/summarizing-transcript-compactor.ts†L203-L305】 |
| `token_budget` | Retains high-value tail messages and system prompts while aggressively shrinking the transcript to a specific token budget, summarizing earlier history if needed.【F:platform/runtime/engine/src/transcript-compactors/token-budget-compactor.ts†L12-L105】 | `tokenBudget` (required) sets the target budget, `keepTail` preserves the most recent exchanges (including tool pairs), and `hardFloor` relaxes the budget when a model cannot fit within the requested tokens.【F:platform/core/types/src/config.ts†L268-L275】【F:platform/runtime/engine/src/transcript-compactors/token-budget-compactor.ts†L44-L84】 | None. |
| `intelligent` | Builds a tree of manager/subagent transcripts, stores parent context artifacts, and emits per-agent summaries tailored to workflow roles.【F:platform/runtime/engine/src/transcript-compactors/intelligent-transcript-compactor.ts†L13-L166】【F:platform/runtime/engine/src/transcript-compactors/intelligent-transcript-compactor.ts†L200-L266】 | `minMessagesBeforeCompaction` delays compaction until a threshold, `enableParentContextStorage` toggles rich context capture, and `agentContextRequirements` lets you override per-agent history budgets and preservation rules by ID pattern.【F:platform/core/types/src/config.ts†L258-L266】【F:platform/runtime/engine/src/transcript-compactors/intelligent-transcript-compactor.ts†L113-L166】【F:platform/runtime/engine/src/transcript-compactors/intelligent-transcript-compactor.ts†L200-L266】 | None beyond stored context telemetry. |

### Configuration examples

The snippets below show a global compactor with per-agent overrides in both JSON and YAML formats.

```jsonc
// eddie.config.json
{
  "transcript": {
    "compactor": {
      "strategy": "token_budget",
      "tokenBudget": 6000,
      "keepTail": 8
    }
  },
  "agents": {
    "mode": "orchestrator",
    "manager": {
      "id": "manager",
      "transcript": {
        "compactor": {
          "strategy": "intelligent",
          "minMessagesBeforeCompaction": 12,
          "enableParentContextStorage": true
        }
      }
    },
    "subagents": [
      {
        "id": "summariser",
        "transcript": {
          "compactor": {
            "strategy": "summarizer",
            "windowSize": 200,
            "http": {
              "url": "https://summary.example.com/compact",
              "timeoutMs": 2000
            }
          }
        }
      }
    ]
  }
}
```

```yaml
# eddie.config.yaml
transcript:
  compactor:
    strategy: simple
    maxMessages: 400
    keepLast: 60
agents:
  mode: orchestrator
  manager:
    id: manager
  subagents:
    - id: researcher
      transcript:
        compactor:
          strategy: token_budget
          tokenBudget: 4500
          hardFloor: 2500
```

Hook handlers attached to `preCompact` can log or emit metrics whenever the engine trims history, and the `transcript.compaction` timer helps correlate those events with iteration latency in your observability stack.【F:platform/runtime/engine/src/transcript/transcript-compaction.service.ts†L101-L144】【F:platform/runtime/engine/src/agents/runner/agent-run-loop.ts†L43-L75】
