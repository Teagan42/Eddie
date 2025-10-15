# @eddie/types

## Purpose

Centralised TypeScript definitions that describe the contracts shared across Eddie's
packages and services. Consumers import these interfaces to align streaming payloads,
tool execution hooks, and context-packing outputs without introducing circular
dependencies.

## Installation

```bash
npm install @eddie/types
```

The package is published as ESM and contains only type exports plus a few utility helpers.

## API Reference

### Conversation models

- `ChatMessage` / `Role` – strongly typed chat transcripts exchanged with providers.
- `StreamEvent` – discriminated union representing streaming deltas, tool calls, tool
  results, notifications, and terminal events.
- `StreamOptions` – configuration passed to provider adapters when starting a run.

### Tooling contracts

- `ToolSchema` and `ToolDefinition` – describe function-call tools and their
  implementation signature.
- `ToolResult` / `ToolOutput` – standard structure for returning typed payloads back to the
  orchestrator.
- `ToolExecutionContext` – utilities supplied to tools (current working directory,
  confirmation prompt, environment).

### Context packing

- `PackedFile`, `PackedResource`, and `PackedContext` – describe the bundle returned by the
  context service when preparing source files and resources for an agent.
- `composeResourceText(resource)` – helper that formats a resource into a comment delimited
  string for inclusion in transcripts.

### Chat session domain events

`chat-sessions/events` exports event classes that NestJS modules can publish when chat
state changes (`ChatSessionCreatedEvent`, `ChatSessionUpdatedEvent`, etc.). The constant
`CHAT_SESSION_EVENT_CLASSES` makes it easy to register all events at once.

## Usage Examples

```ts
import type { StreamEvent, ToolDefinition } from "@eddie/types";

export const echoTool: ToolDefinition = {
  name: "echo",
  jsonSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  async handler(args) {
    return {
      schema: "echo.result",
      content: args.message as string,
    };
  },
};

export async function logStream(events: AsyncIterable<StreamEvent>) {
  for await (const event of events) {
    if (event.type === "delta") {
      process.stdout.write(event.text);
    }
  }
}
```

## Testing

The package does not ship runtime behaviour beyond `composeResourceText`, but run the
Vitest suite to keep documentation checks and helper assertions passing:

```bash
npm run test --workspace @eddie/types
```
