# MCP Tool Source Integration

`McpToolSourceService` is the runtime bridge between Model Context Protocol
servers and Eddie's unified tool registry. It hydrates remote MCP servers,
authenticates requests, and emits Eddie `ToolDefinition` records, resource
references, and prompt templates that can be consumed by any Eddie surface.

## Runtime Flow

1. `collectTools` is the primary entry point for runtime consumers. It accepts
   the configured `MCPToolSourceConfig` entries, calls `discoverSources`, and
   returns `{ tools, resources, prompts }`.
2. `discoverSources` fans out per-source discovery, calling `discoverSource`
   to hydrate tool descriptors, resource metadata, and prompts from each server.
3. For every request the service creates an MCP client via `withClient`, which
   loads transports, negotiates capabilities, and writes to the in-memory
   session cache before executing the discovery work.

The session cache stores the latest `sessionId`, `capabilities`, and
`serverInfo` per source id. This allows `collectTools` to reuse negotiated
handshakes across repeated runs and avoids redundant capability logging.

## Transport Loading and Authentication

- `withClient` lazily loads the MCP SDK by importing `@modelcontextprotocol/sdk`
  modules on demand. It resolves the transport name from the source definition
  and instantiates either the `streamable-http` or `sse` transport.
- The service always applies JSON content headers, merges any user supplied
  headers, and then computes authorization if no explicit header is present.
  `computeAuthorization` supports `basic` username/password credentials,
  `bearer` tokens, and a `none` fallback.
- Header calculation supports per-source secrets alongside shared auth blocks,
  giving fine-grained control over MCP servers that require API keys or HTTP
  auth challenges.

## Capability Discovery and Session Caching

`McpToolSourceService` relies on the server advertised capabilities to decide
which RPC methods to call:

- `tools/list` is called when the server exposes `tools.list`; `tools.call`
  is required later when handlers execute.
- `resources/list` is invoked when `resources.list` is available.
- `prompts/list` and `prompts/get` are paired to preload prompt templates when
  the server indicates support and exposes argument-free prompts.

Each request is routed through `executeRequest`, which measures the duration via
`performance.now()`, logs success or failure, and preserves the `durationMs`
metric alongside the transport name and server identity. The session cache also
captures the negotiated capabilities and `sessionId` for future runs.

## Transforming MCP Payloads into Eddie Tools

- Tool descriptors are converted into Eddie `ToolDefinition` objects. The input
  schema is deep-cloned, and output schemas flow through `normalizeOutputSchema`
  to enforce `$id`/`id` invariants.
- Tool handlers proxy to `callTool`, which wraps `tools/call`. Responses are
  normalized via `toToolResult`, returning the `schema`, `content`, optional
  structured `data`, and structured `metadata`. When the server returns plain
  content blocks, `flattenContent` produces a textual payload with the default
  `mcp.tool.result` schema.
- Resource and prompt descriptors are cloned to prevent mutation and receive a
  `sourceId` tag so downstream surfaces can trace the origin server.

## Configuration and Authentication Blocks

Define MCP sources with `MCPToolSourceConfig` objects. A minimal example:

```ts
{
  id: 'search-mcp',
  url: 'https://mcp.example.com',
  transport: 'streamable-http',
  capabilities: {
    tools: { list: true, call: true },
    resources: { list: true },
    prompts: { list: true, get: true }
  },
  headers: {
    'x-workspace': 'prod'
  },
  auth: {
    type: 'bearer',
    token: process.env.SEARCH_MCP_TOKEN!
  }
}
```

`auth` blocks mirror the `MCPAuthConfig` union and support the following
strategies:

- `basic` – supply `username` and `password`. The service encodes the pair and
  applies the `Authorization` header when one is not already provided.
- `bearer` – forward bearer tokens as `Authorization: Bearer <token>`.
- `none` – omit automatic credentials entirely.

When custom headers contain an `authorization` entry the service leaves it
untouched, allowing bespoke schemes such as HMAC signatures.

## Logging and Metrics

`LoggerService` provides a scoped logger named `mcp-tool-source` that captures
operational telemetry:

- `mcp.initialize` entries record connection attempts, negotiated capabilities,
  and handshake errors.
- `mcp.request` entries wrap every RPC, capturing `durationMs`, outcome status,
  server identity, and transport name.

The log payloads make it easy to plug into existing observability tooling and
monitor the health, latency, and failure modes of MCP integrations.
