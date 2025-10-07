# Eddie CLI

Provider-agnostic AI assistant for the command line. Eddie hydrates prompts with context from your workspace, streams responses from multiple model providers, orchestrates tool calls, and records structured traces for reproducible automation.

## Features

- Multi-provider adapters (OpenAI, Anthropic, Groq-compatible) with streaming support
- Context packer that pulls files via glob patterns, budgets tokens, and feeds models rich workspace snippets
- Tool registry with built-in `bash`, `file_read`, and `file_write` helpers plus confirmation prompts
- Lifecycle hooks, optional OpenTelemetry spans, and JSONL traces for observability
- Interactive chat, single-shot prompts, context previews, and automated run mode

## Getting Started

```bash
npm install
npm run build
npm run dev -- ask "Summarize src/core/engine.ts"
```

Or install globally once published:

```bash
npm install -g eddie-cli
eddie ask "List recent changes" --context "src/**/*.ts"
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
npm test
```

Vitest covers utilities such as secret redaction, with room to expand using fixtures for provider adapters and tool loops.

## License

MIT © 2025 Teagan Glenn
