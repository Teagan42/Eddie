# Adding Model Context Protocol (MCP) servers

Eddie can discover remote tools and supplemental resources from any server that
talks the [Model Context Protocol](https://modelcontextprotocol.io/). Once a
server is registered the CLI automatically invokes `initialize`, `tools/list`,
and `resources/list`, exposes the returned tools to agents, and stitches the
returned resources into the packed context that prompts receive.【F:src/integrations/mcp/mcp-tool-source.service.ts†L24-L162】【F:src/core/engine/engine.service.ts†L144-L199】

## 1. Declare the MCP source in your config

MCP servers are configured in the `tools.sources` array inside
`eddie.config.(json|yaml)`. Each entry must provide a unique `id`, the literal
`type: "mcp"`, and the JSON-RPC endpoint `url`. Optional fields let you set a
human readable `name`, inject HTTP `headers`, and advertise protocol
`capabilities` to the server during the handshake.【F:src/config/types.ts†L194-L210】【F:src/config/config.service.ts†L948-L1016】

```yaml
model: gpt-4o-mini
provider:
  name: openai

context:
  include:
    - "docs/**/*.md"

tools:
  sources:
    - id: docs-service
      type: mcp
      url: https://mcp.example.com/rpc
      name: Internal docs indexer
      capabilities:
        tools: {}
        resources: {}
```

When Eddie starts a session it will call this endpoint, register every reported
tool alongside the built-in catalog (`bash`, `file_read`, `file_write`), and
assign any discovered MCP resources to the current context so prompts and
subagents can reference them via the usual `context.resources` data.
【F:src/core/engine/engine.service.ts†L144-L199】

## 2. Provide authentication (optional)

If your MCP server requires authentication, declare the scheme under the
`auth` block. Basic credentials are converted to `Authorization: Basic` headers
and bearer tokens map to `Authorization: Bearer` automatically. You can also set
`type: "none"` to force Eddie to skip header injection when the server relies on
other mechanisms (for example IP allow lists).【F:src/config/types.ts†L200-L210】【F:src/config/config.service.ts†L1018-L1052】【F:src/integrations/mcp/mcp-tool-source.service.ts†L204-L268】

```yaml
tools:
  sources:
    - id: secured-research
      type: mcp
      url: https://research.example.com/mcp
      auth:
        type: bearer
        token: ${MCP_RESEARCH_TOKEN}
```

Set `headers` when you need to forward additional metadata (such as tenant IDs
or custom API keys). Eddie merges these with the required JSON content headers
and omits duplicate Authorization values so you stay in control of the final
request payload.【F:src/integrations/mcp/mcp-tool-source.service.ts†L199-L233】

## 3. Allow or disable tools per session

Discovered MCP tools obey the same `tools.enabled` and `tools.disabled`
allowlists as the built-ins. Declare the exact tool names (as returned by the
MCP server) to opt in or opt out on a per-run basis, or leave the lists unset to
make every discovered tool available. Subagents can still apply their own tool
filters on top of the global configuration.【F:src/core/engine/engine.service.ts†L168-L214】【F:src/core/engine/engine.service.ts†L409-L416】【F:src/core/engine/engine.service.ts†L501-L514】

```yaml
tools:
  enabled: ["bash", "mock_search"]
  disabled: ["file_write"]
  sources:
    - id: mock
      type: mcp
      url: http://localhost:4000/rpc
```

With this setup the session exposes the `mock_search` tool from the MCP server
and the built-in `bash` helper while keeping `file_write` disabled.

## 4. Verify the connection

Run any Eddie command that loads the engine (for example `ask` or `run`). When
the MCP server responds successfully you will see its tools invoked in traces
and hook payloads, and any resource entries will be appended to the packed
context. Connection issues and protocol errors bubble up as descriptive
exceptions that include the HTTP status or JSON-RPC error payload so you can fix
them quickly.【F:src/integrations/mcp/mcp-tool-source.service.ts†L130-L233】

Once the server is registered you can orchestrate it like any other tool source:
configure subagents to call its tools, wrap the outputs in interceptors, and
propagate the enriched context through your prompts.
