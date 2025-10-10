# Witty household personal assistant

This example boots a single Eddie agent that behaves like a playful personal
assistant. The prompts lean into a witty persona while steering the agent to use
MCP servers that expose smart home controls, long-term memory, and Plex media
metadata.

## How to run

From the repository root execute:

```bash
eddie run --config examples/personal-assistant/eddie.config.yaml
```

The configuration instructs the agent to keep its responses lighthearted while
coordinating across three MCP servers:

- **home-assistant** for smart device automation and status checks.
- **memory** to recall recent conversations or saved preferences.
- **plex** to curate entertainment recommendations.

The Jinja templates in `examples/personal-assistant/prompts/` showcase how you can
combine a bespoke persona with structured guidance about which MCP resources to
consult before answering.
