# Personal assistant with MCP automations

This example showcases how to script a bespoke personal assistant persona that
coordinates with external Model Context Protocol (MCP) servers. The manager
prompt steers "Aurora", a warm and witty companion who can orchestrate home
automation, recall shared memories, and curate entertainment suggestions.

## How to run

From the repository root execute:

```bash
eddie run --config examples/personal-assistant/eddie.config.yaml
```

The configuration loads the Eta templates in `examples/personal-assistant/prompts`
and wires three MCP servers into the tool catalog so Aurora can control a Home
Assistant instance, synchronise long-term memory, and browse the household Plex
library.

## Scenario highlights

- **Distinct personality:** Aurora's system prompt layers tone, quirks, and
  rituals so replies feel consistent and human.
- **Context variables:** Household preferences and schedules flow through
  `context.variables`, giving the assistant grounding when handling requests.
- **MCP orchestration:** Home Assistant, Memory Vault, and Plex Concierge MCP
  servers expose automation, knowledge, and media tools without custom code.
