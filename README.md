# Eddie CLI

Provider-agnostic AI assistant for the command line. Eddie hydrates prompts with context from your workspace, streams responses from multiple model providers, orchestrates tool calls, and records structured traces for reproducible automation. The CLI is now backed by a Nest application context so every command benefits from dependency injection, a shared logger, and cohesive lifecycle management.

## Features

- Multi-provider adapters (OpenAI, Anthropic, Groq-compatible) with streaming support
- Context service that packs workspace files via glob patterns, budgets tokens, and feeds models rich snippets
- Tool registry with built-in `bash`, `file_read`, and `file_write` helpers plus confirmation prompts
- Lifecycle hooks, optional OpenTelemetry spans, and JSONL traces for observability
- Interactive chat, single-shot prompts, context previews, and automated run mode

## Getting Started

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

## Testing

```bash
npm run lint
npm test
```

Vitest covers utilities such as secret redaction, provider wiring, and CLI behaviours, while ESLint enforces the shared Nest coding standards.

## Migration Notes

If you are upgrading from the legacy Commander-based CLI, review [the Nest CLI migration guide](docs/migration/cli-nest-refactor.md) for details on environment variables, configuration file lookup, and build steps.

## License

MIT © 2025 Teagan Glenn
