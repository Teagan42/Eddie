# Demo agent screenshot dataset

This demo screenshot dataset packages the static fixtures used to capture Eddie's web UI
screenshots. The `eddie.config.yaml` file enables the `demoSeeds` block so the
CLI and API can replay seeded sessions without making live provider calls.

## Included fixtures

- `data/chat-sessions.json` – Chat sessions with user and assistant messages used
  in the timeline screenshot.
- `data/agent-invocations.json` – The agent invocation tree highlighted in the
  agent detail modal.
- `data/traces.json` – Streaming trace events shown in the trace timeline view.
- `data/logs.json` – Terminal and server logs replayed in the log console.
- `data/runtime-config.json` – Runtime metadata captured alongside the
  screenshots.

## Usage

1. From the repository root, run the CLI with the demo preset:
   ```bash
   eddie ask "Replay the screenshot demo" --preset demo-web
   ```
2. The preset wires `demoSeeds` to these fixtures so every chat, trace, and log
   panel renders the pre-recorded content used in the documentation.
3. Capture the UI panels (chat timeline, trace timeline, and log console) while
   the CLI replays the seeded data.
