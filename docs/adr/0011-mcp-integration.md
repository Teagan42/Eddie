# ADR 0011: MCP Integration Architecture

## Status

Accepted

## Context

Customers increasingly publish tools through the Model Context Protocol (MCP) so that language models can discover prompts, resources, and callable endpoints at runtime. Eddie initially shipped with bespoke HTTP adapters for each provider, leaving the CLI and API to maintain one-off SDKs and authentication logic. As the MCP ecosystem matured we needed a single integration path that could hydrate tool registries, surface remote prompts, and stream results without forcing downstream teams to rebuild adapters.

## Decision

We introduced `@eddie/mcp`, a Nest-compatible package that wraps the official Model Context Protocol SDK. The module lives in `packages/mcp` and exposes `McpToolSourceService`, which accepts configuration from `@eddie/config`, dynamically loads the streamable HTTP and SSE transports, and caches session capabilities per source. During boot the service calls `collectTools` to aggregate tool definitions, discovered resources, and prompts so hosts (CLI, API, or web workers) can register them with the existing tool registry. Authentication headers and client metadata are normalised inside the service, ensuring consistent logging through the shared `LoggerService`.

## Consequences

- MCP servers are integrated once and reused across surfaces, improving tooling compatibility for both CLI workflows and the hosted API.
- Session caching avoids repeated `prompts/list` or `tools/list` calls, cutting startup latency while still respecting capability negotiation.
- The package remains optional—applications can omit the module when MCP sources are disabled, keeping cold-start time low for simple deployments.

## Alternatives Considered

- **custom integration per server** – rejected because maintaining bespoke HTTP clients for each vendor would quickly diverge and fail to benefit from the shared SDK improvements.
- **Embedding MCP logic in the API only** – rejected; doing so would have duplicated discovery logic when the CLI or future workers needed the same integration, making testing more difficult.
