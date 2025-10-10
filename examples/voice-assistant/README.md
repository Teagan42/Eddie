# Velvet Echo voice concierge

This example runs a single Eddie agent tuned for voice-first interactions. The
persona blends the warmth of a late-night radio host with the precision of a
smart home operator so every response sounds natural when spoken aloud.

## How to run

From the repository root execute:

```bash
eddie run --config examples/voice-assistant/eddie.config.yaml
```

## Scenario highlights

- **Voice-native delivery:** Prompts coach the agent to speak in short,
  rhythmic sentences that text-to-speech systems can pronounce cleanly.
- **Environmental awareness:** Context variables describe the listener,
  wake word, and room acoustics so the agent can tailor each reply.
- **Gentle confirmations:** The assistant double-checks important actions and
  closes with a warm signature sign-off for continuity across sessions.
