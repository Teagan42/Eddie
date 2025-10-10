# Eddie CLI

Provider-agnostic AI assistant for the command line. Eddie hydrates prompts with context from your workspace, streams responses from multiple model providers, orchestrates tool calls, and records structured traces for reproducible automation. The CLI is now backed by a Nest application context so every command benefits from dependency injection, a shared logger, and cohesive lifecycle management.

## Features

- Multi-provider adapters (OpenAI, Anthropic, Groq-compatible) with streaming support
- Context service that packs workspace files via glob patterns, budgets tokens, and feeds models rich snippets
- Tool registry with built-in `bash`, `file_read`, and `file_write` helpers plus confirmation prompts
- Nested agent orchestrator that lets manager agents spawn task-specific subagents with their own prompts, context slices, and tools
- Lifecycle hooks, optional OpenTelemetry spans, and JSONL traces for observability
- Interactive chat, single-shot prompts, context previews, and automated run mode

## Getting Started

Requires Node.js 20 or newer (Node 22 is used in development and CI). The bundled dependencies rely on modern ESM support that is not available in Node 18.

1. Install dependencies and compile the Nest application. The `build` script runs `nest build`, emitting the `apps/cli/dist/main.js` binary that is also published as the `eddie` executable.

   ```bash
   npm install
   npm run build
   ```

2. Execute commands through the compiled binary (or via `npm exec eddie`):

   ```bash
   node apps/cli/dist/main.js ask "Summarize apps/cli/src/core/engine/engine.service.ts"
   # or
   npm exec -- eddie context --context "src/**/*.ts"
   ```

3. For local development with hot-reload, start the Nest CLI wrapper:

   ```bash
   npm run dev -- ask "Summarize apps/cli/src/core/engine/engine.service.ts"
   ```

## Configuration

Eddie loads configuration from `eddie.config.(json|yaml)` in your project root
and merges it with the defaults defined in `apps/cli/src/config/defaults.ts`. CLI flags
still win for per-run overrides (for example `--model`, `--provider`,
`--context`, `--auto-approve`, `--jsonl-trace`).

Every top-level key in `EddieConfig` serves a specific subsystem:

- **`model` / `provider`** – Default model name and provider credentials used
  when no agent overrides are supplied.
- **`providers`** – Named provider profiles (`Record<string, ProviderProfileConfig>`) for
  multi-provider routing; each profile can declare its own API key, base URL, or
  model version.
- **`context`** – Globs, limits, and reusable bundles that determine what files
  flow into prompts.
- **`systemPrompt`** – The base prompt injected into the primary agent.
- **`logLevel`** – Baseline verbosity for all loggers.
- **`logging`** – Destination (`stdout`, `stderr`, or `file` with optional path),
  pretty-print, color, and timestamp settings for the structured logger.
- **`output`** – JSONL trace location, append mode, pretty stream toggle, and
  optional working directory for artifacts.
- **`tools`** – Lists of enabled or disabled tool identifiers, auto-approve
  behaviour, and `sources` for external providers (including MCP servers).
- **`hooks`** – Module list and optional directory scanned for lifecycle hook
  implementations.
- **`tokenizer`** – Provider used when computing token budgets.
- **`agents`** – The agent manager prompt, subagent definitions, routing knobs,
  and an enable/disable switch for hierarchical execution.

### Cross-references & maintenance

- Deep dives on subagents live in [docs/subagents.md](docs/subagents.md).
- Adding MCP tool servers is covered in [docs/mcp-servers.md](docs/mcp-servers.md).
- Prompt/context templating is documented in [docs/templates.md](docs/templates.md).
- Running the Web UI against the API stack is covered in [docs/web-ui.md](docs/web-ui.md).

Whenever you add a new configuration key in `apps/cli/src/config/types.ts`, update this
section, `DEFAULT_CONFIG`, and any impacted guides so the documentation stays in
sync with the runtime expectations.

### Example: multi-provider project with file logging

```yaml
model: gpt-4o-mini
provider:
  name: openai
providers:
  anthropic-prod:
    provider:
      name: anthropic
      apiKey: ${ANTHROPIC_API_KEY}
    model: claude-3-5-sonnet-latest
context:
  include:
    - "src/**/*.ts"
  exclude:
    - "dist/**"
  maxBytes: 200000
systemPrompt: "You are Eddie, a CLI coding assistant."
logLevel: info
logging:
  level: debug
  destination:
    type: file
    path: .eddie/logs/run.log
    pretty: false
  enableTimestamps: true
output:
  jsonlTrace: .eddie/trace.jsonl
  jsonlAppend: true
tools:
  enabled: ["file_read", "file_write"]
  disabled: ["bash"] # temporarily disable bash during CI runs
hooks:
  modules:
    - "./dist/hooks/audit.js"
  directory: "./hooks"
tokenizer:
  provider: openai
agents:
  mode: single
  manager:
    prompt: "Review the diff and suggest improvements."
  subagents: []
  routing:
    confidenceThreshold: 0.6
  enableSubagents: false
```

### Example: MCP-powered tooling with agent routing

```yaml
model: gpt-4o-mini
provider:
  name: openai
context:
  include:
    - "src/**/*.ts"
  variables:
    repoName: eddie
tools:
  enabled: ["bash", "file_read", "file_write", "mcp:filesystem"]
  sources:
    - id: local-fs
      type: mcp
      url: http://localhost:3001
      name: Local Filesystem
      headers:
        Authorization: Bearer ${MCP_TOKEN}
      capabilities:
        tools:
          file_search:
            maxResults: 50
hooks:
  directory: "./hooks"
tokenizer:
  provider: tiktoken
agents:
  mode: router
  manager:
    prompt: "Coordinate subagents to implement requested features."
    provider:
      name: openai-compatible
      baseUrl: https://custom-proxy.example.com/v1
      apiKey: ${CUSTOM_KEY}
  subagents:
    - id: planner
      description: "Break work into steps"
      tools: ["mcp:filesystem"]
      routingThreshold: 0.4
    - id: implementer
      description: "Apply filesystem changes"
      tools: ["bash", "file_read", "file_write"]
  routing:
    confidenceThreshold: 0.55
    maxDepth: 3
  enableSubagents: true
output:
  prettyStream: true
```

## Commands

- `eddie ask <prompt>` – Single prompt, streams the response
- `eddie run <prompt>` – Same as ask but designed for tool-heavy automation
- `eddie chat` – Interactive multi-turn session retaining history
- `eddie context` – Preview which files/globs will be sent as context
- `eddie trace` – Inspect the most recent JSONL trace file

## Observability & Agent Hierarchies

Every provider invocation is recorded as an agent phase in the JSONL trace when
`output.jsonlTrace` (or `--jsonl-trace`) is set. The orchestrator now writes
structured records for `agent_start`, `model_call`, `tool_call`, `tool_result`,
`iteration_complete`, and `agent_complete`, each tagged with metadata about the
agent's depth, parent identifier, configured tools, prompt, and context budget.
This makes it straightforward to reconstruct parent/child relationships or to
surface tool output during debugging. The accompanying `eddie trace` command can
be pointed at the file to inspect each phase interactively.

Hook modules can subscribe to the new lifecycle events—`beforeAgentStart`,
`afterAgentComplete`, and `onAgentError`—to stream the same metadata elsewhere
for dashboards or policy enforcement. Object-based hook modules exported from
your project can now register handlers for these events directly:

```ts
export default {
  async beforeAgentStart(payload) {
    console.log("agent starting", payload.metadata.id, payload.metadata.depth);
  },
  async afterAgentComplete(payload) {
    console.log("agent finished", payload.metadata.id, payload.iterations);
  },
  onAgentError(payload) {
    console.error("agent failed", payload.metadata.id, payload.error.message);
  },
};
```

Every payload includes the agent's prompt, context summary, history length, and
sanitised metadata so downstream systems can observe full hierarchies without
needing internal Eddie classes.

### Hook event naming

Hook identifiers are now canonicalised as camelCase strings. Import
`HOOK_EVENTS` from the published `eddie/hooks` entrypoint (or directly from
`apps/cli/src/hooks` when working inside this repository) to avoid typos and stay
aligned with future additions:

```ts
import { HOOK_EVENTS } from "eddie/hooks";

export default {
  [HOOK_EVENTS.sessionStart]: (payload) => {
    // session metadata + runtime config
  },
  [HOOK_EVENTS.userPromptSubmit]: (payload) => {
    // prompt text and history length
  },
  [HOOK_EVENTS.afterAgentComplete]: (payload) => {
    // agent transcript and iteration counts
  },
};
```

The existing PascalCase spellings (`SessionStart`, `PreToolUse`, `Stop`, etc.)
are still accepted for the current release and emit a deprecation warning when
loaded. They will be removed after the next minor release, so update custom
hook modules to the camelCase variants soon to avoid interruptions.

## Testing

```bash
npm run lint
npm test
```

Vitest covers utilities such as secret redaction, provider wiring, and CLI behaviours, while ESLint enforces the shared Nest coding standards.

## Documentation

- [Adding MCP servers](docs/mcp-servers.md)
- [Subagents guide](docs/subagents.md)
- [Prompt and context templates](docs/templates.md)
- [CLI options reference](docs/cli-reference.md)
- [Nest CLI migration guide](docs/migration/cli-nest-refactor.md)

If you are upgrading from the legacy Commander-based CLI, review the migration
guide above for details on environment variables, configuration file lookup,
and build steps.

## License

Licensed under the Business Source License 1.1 (change date 2029-01-01, change license Apache 2.0) © 2025 ConstructorFleet L.L.C
