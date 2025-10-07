# 0007 - Agent orchestrator and nested agents

## Status

Accepted

## Context

The original engine loop in `EngineService` combined configuration hydration,
context packing, provider streaming, and tool execution inside a single method.
While functional for a single agent, the design made it impossible to spawn
sub-agents with bespoke prompts, isolated context slices, or their own tool
registries. New product requirements call for manager agents to hand tasks off
to specialist sub-agents while retaining the existing stream renderer and hook
integrations.

## Decision

We introduced a dedicated `core/agents` module with:

- `AgentDefinition` – declarative metadata for an agent (identifier, system
  prompt, optional default context, and tool definitions).
- `AgentInvocation` – runtime container that builds the chat transcript,
  owns a tool registry, and exposes a `spawn` helper for delegating work to
  child agents.
- `AgentOrchestratorService` – coordinates provider streams for each
  invocation, manages trace emission, and tracks runtime state so parents can
  safely spawn sub-agents that reuse the shared provider, hooks, and confirm
  loop.

`EngineService` now resolves the orchestrator, constructs the root
`AgentDefinition` from the hydrated configuration, and delegates execution to
`AgentOrchestratorService`. The orchestrator produces per-agent transcripts
while still emitting lifecycle hooks and rendering streaming events via the
existing services.

## Consequences

- Manager agents can spawn sub-agents with unique system prompts, context
  slices, and tool registries without reimplementing the engine loop.
- Traces include the originating agent identifier for every entry, enabling
  downstream analytics to attribute tool calls and completions.
- Unit tests under `test/unit/core/agents` mock provider streams to verify the
  ordering of manager and sub-agent hand-offs.
- `EngineResult` now returns both the flattened chat history and the list of
  executed agent invocations, preparing the CLI for agent-aware UX in future
  updates.
