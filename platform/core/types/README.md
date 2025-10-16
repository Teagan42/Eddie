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

### Conversation models & providers

- `ChatMessage` / `Role` – strongly typed chat transcripts exchanged with providers.
- `StreamEvent` – discriminated union representing streaming deltas, tool calls, tool
  results, notifications, and terminal events.
- `StreamOptions` – configuration passed to provider adapters when starting a run.
- `ProviderAdapter` / `ProviderAdapterFactory` – describe pluggable model providers that
  stream responses and advertise discoverable models.

### Tooling contracts

- `ToolSchema` and `ToolDefinition` – describe function-call tools and their
  implementation signature.
- `ToolResult` / `ToolOutput` – standard structure for returning typed payloads back to the
  orchestrator.
- `ToolExecutionContext` – utilities supplied to tools (current working directory,
  confirmation prompt, environment).

### Configuration & runtime options

- `ProviderConfig`, `EddieConfig`, and `EddieConfigInput` – shape the resolved Eddie
  configuration alongside its user-supplied inputs.
- `CliRuntimeOptions` – CLI/runtime overrides merged into the configuration service.
- `ToolSourceConfig` / `MCPToolSourceConfig` – metadata for remote MCP tool registries.
- `ApiConfig`, `HooksConfig`, `ToolsConfig`, and related interfaces – describe
  infrastructure and feature toggles surfaced through configuration files.

### Context packing

- `PackedFile`, `PackedResource`, and `PackedContext` – describe the bundle returned by the
  context service when preparing source files and resources for an agent.
- `composeResourceText(resource)` – helper that formats a resource into a comment delimited
  string for inclusion in transcripts.

### Hooks & orchestration events

- `HOOK_EVENTS`, `HookEventMap`, and `HookListener` – enumerate the lifecycle notifications
  emitted by the engine.
- `SessionStartPayload`, `AgentLifecyclePayload`, and related interfaces – describe
  payloads observed by hook modules when agents run, spawn subagents, or encounter errors.
- `HookAgentRunOptions` / `HookAgentRunResult` – shared contracts for hook-triggered agent
  executions.

### Chat session domain events & API payloads

`chat-sessions/events` exports event classes that NestJS modules can publish when chat
state changes (`ChatSessionCreatedEvent`, `ChatSessionUpdatedEvent`, etc.). The constant
`CHAT_SESSION_EVENT_CLASSES` makes it easy to register all events at once.

- `ConfigSchemaPayload`, `ConfigSourcePayload`, and `ConfigPreviewPayload` – DTO contracts
  used by the Config Editor REST API.
- `AgentInvocationSnapshot` / `AgentInvocationMessageSnapshot` – snapshots emitted by the
  chat session repository when persisting agent traces.
- `ChatSessionSnapshot` and `ChatMessageSnapshot` – describe serialized session state for
  web and CLI consumers.

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
