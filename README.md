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

1. Install dependencies and compile the Nest application. The `build` script runs `nest build`, emitting the `dist/main.js` binary that is also published as the `eddie` executable.

   ```bash
   npm install
   npm run build
   ```

2. Execute commands through the compiled binary (or via `npm exec eddie`):

   ```bash
   node dist/main.js ask "Summarize src/core/engine/engine.service.ts"
   # or
   npm exec -- eddie context --context "src/**/*.ts"
   ```

3. For local development with hot-reload, start the Nest CLI wrapper:

   ```bash
   npm run dev -- ask "Summarize src/core/engine/engine.service.ts"
   ```

## Configuration

Eddie looks for `eddie.config.(json|yaml)` in the project root. Example:

```yaml
model: gpt-4o-mini
provider:
  name: openai
context:
  include:
    - "src/**/*.ts"
  exclude:
    - "dist/**"
  maxBytes: 200000
tools:
  enabled: ["bash", "file_read", "file_write"]
  autoApprove: false
output:
  jsonlTrace: .eddie/trace.jsonl
```

CLI flags override config values: `--model`, `--provider`, `--context`, `--auto-approve`, `--jsonl-trace`, etc.

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
`src/hooks` when working inside this repository) to avoid typos and stay
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

- [Subagents guide](docs/subagents.md)
- [Prompt and context templates](docs/templates.md)
- [Nest CLI migration guide](docs/migration/cli-nest-refactor.md)

If you are upgrading from the legacy Commander-based CLI, review the migration
guide above for details on environment variables, configuration file lookup,
and build steps.

## License

MIT © 2025 Teagan Glenn
