# Adding Model Context Protocol (MCP) servers

Eddie can discover remote tools and supplemental resources from any server that
talks the [Model Context Protocol](https://modelcontextprotocol.io/). Once a
server is registered the CLI automatically invokes `initialize`, `tools/list`,
and `resources/list`, exposes the returned tools to agents, and stitches the
returned resources into the packed context that prompts receive.【F:apps/cli/src/integrations/mcp/mcp-tool-source.service.ts†L24-L162】【F:apps/cli/src/core/engine/engine.service.ts†L144-L199】

## 1. Declare the MCP source in your config

MCP servers are configured in the `tools.sources` array inside
`eddie.config.(json|yaml)`. Each entry must provide a unique `id`, the literal
`type: "mcp"`, and the JSON-RPC endpoint `url`. Optional fields let you set a
human readable `name`, inject HTTP `headers`, and advertise protocol
`capabilities` to the server during the handshake.【F:platform/core/types/src/config.ts†L367-L380】【F:platform/core/config/src/validation/config-validator.ts†L385-L514】

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
【F:apps/cli/src/core/engine/engine.service.ts†L144-L199】

## 2. Provide authentication (optional)

If your MCP server requires authentication, declare the scheme under the
`auth` block. Basic credentials are converted to `Authorization: Basic` headers
and bearer tokens map to `Authorization: Bearer` automatically. You can also set
`type: "none"` to force Eddie to skip header injection when the server relies on
other mechanisms (for example IP allow lists).【F:platform/core/types/src/config.ts†L347-L365】【F:platform/core/config/src/validation/config-validator.ts†L465-L500】【F:apps/cli/src/integrations/mcp/mcp-tool-source.service.ts†L204-L268】

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
request payload.【F:apps/cli/src/integrations/mcp/mcp-tool-source.service.ts†L199-L233】

## 3. Allow or disable tools per session

Discovered MCP tools obey the same `tools.enabled` and `tools.disabled`
allowlists as the built-ins. Declare the exact tool names (as returned by the
MCP server) to opt in or opt out on a per-run basis, or leave the lists unset to
make every discovered tool available. Subagents can still apply their own tool
filters on top of the global configuration.【F:apps/cli/src/core/engine/engine.service.ts†L168-L214】【F:apps/cli/src/core/engine/engine.service.ts†L409-L416】【F:apps/cli/src/core/engine/engine.service.ts†L501-L514】

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
them quickly.【F:apps/cli/src/integrations/mcp/mcp-tool-source.service.ts†L130-L233】

Once the server is registered you can orchestrate it like any other tool source:
configure subagents to call its tools, wrap the outputs in interceptors, and
propagate the enriched context through your prompts.

## 5. Structure prompts to exploit MCP resources

MCP servers often expose curated documents, indices, or dynamic data feeds as
`resources`. Eddie appends these to the packed context so prompts can reason
about them just like local bundles. A good prompt flow treats MCP resources as
first-class knowledge modules rather than ad-hoc strings. A typical workflow
looks like this:

1. **Audit resource metadata** – Start a dry run (for example `eddie ask --trace`)
   and inspect the `context.resources` block in the emitted trace. Note resource
   IDs, display names, and any `virtualPath` segments that should be surfaced to
   the model.
2. **Design resource-aware templates** – Update your system and user prompt
   templates to acknowledge the remote materials. Jinja templates can iterate over
   resources so you can spell out where the data originated and how the agent
   should use it. For instance:

   ```jinja
   {% for resource in context.resources %}
   Resource: {{ resource.name or resource.id }}
   Location: {{ resource.virtualPath or "remote" }}
   Summary: {{ resource.text[:400] }}
   {% endfor %}
   ```

   Pair these sections with guardrails that remind the model which tools map to
   the same MCP server (for example "Use `docs_search` before answering").
3. **Fan out with subagents** – When a remote server exposes multiple
   specialised tools, declare dedicated subagents whose prompts focus on those
   capabilities. Each subagent can inherit the shared context while overlaying
   a tighter instruction set ("You are the research summariser; cite documents
   from `docs-service`").
4. **Capture responses for auditing** – Wrap the MCP-backed agents with
   interceptors or logging middleware so traces include which MCP tools fired
   and how the prompt contextualised them. This is especially useful when
   multiple teams share the same MCP catalogue.

By structuring prompts around the remote resources—and keeping the instructions
in sync with the tools surfaced by the MCP server—you get consistent, auditable
responses that respect the knowledge boundaries defined by the remote service.

## 6. Work with MCP prompt components

When an MCP server advertises prompt support, Eddie now queries both
`prompts/list` and `prompts/get` during discovery. Each prompt definition is
cloned and tagged with the originating `sourceId`, so you receive stable
metadata, argument schemas, and message sequences alongside the tools and
resources reported by the server.【F:apps/cli/src/integrations/mcp/mcp-tool-source.service.ts†L29-L209】

The engine fetches these prompt definitions together with other MCP assets,
making them available for custom orchestration even though the default CLI does
not yet inject them into the packed context.【F:apps/cli/src/core/engine/engine.service.ts†L147-L156】
You can wire the discovered prompts into your own Jinja templates, persist them in
hooks, or mirror them into local prompt catalogs to keep subagents aligned with
remote guidance.

If a server omits the prompt endpoints, Eddie ignores the `Method not found`
error and continues with the rest of the discovery flow, so older MCP servers
remain compatible.【F:apps/cli/src/integrations/mcp/mcp-tool-source.service.ts†L153-L206】【F:apps/cli/src/integrations/mcp/mcp-tool-source.service.ts†L353-L371】
