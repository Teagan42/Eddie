# Provider Integrations Package

This package provides streaming adapters for third-party model APIs and the
utilities that coordinate their behaviour. It is available to other workspaces
through the public exports defined in [`src/index.ts`](src/index.ts).

## Available adapters

Three adapters are exported alongside their Nest-friendly factories:

- **OpenAI** (`OpenAIAdapter` / `OpenAIAdapterFactory`) – streams from the
  official OpenAI Responses API. It normalises tool call deltas, propagates
  OpenAI metadata into `StreamEvent` payloads, and supports structured outputs
  by mapping Eddie `ToolSchema` definitions into OpenAI `function` tools.
- **Anthropic** (`AnthropicAdapter` / `AnthropicAdapterFactory`) – connects to
  the Claude Messages API, forwarding tool invocations and response deltas while
  preserving Anthropic-specific metadata in the emitted `StreamEvent`s.
- **OpenAI-compatible** (`OpenAICompatibleAdapter` /
  `OpenAICompatibleAdapterFactory`) – targets APIs that implement an
  OpenAI-style `/chat/completions` contract (for example, Groq). It keeps
  request headers configurable so self-hosted services can be reached.

All three adapters share the same streaming contract. Each one yields
`StreamEvent` records (`delta`, `tool_call`, `notification`, `end`, `error`)
that downstream surfaces consume without provider-specific branching.

## ProviderFactoryService selection

`ProviderFactoryService` aggregates every registered `ProviderAdapterFactory`
exported in `src/index.ts`. When a host calls `create(config)` the service:

1. Returns a lightweight **noop** adapter when `config.name` is `"noop"`. The
   noop adapter is effectively a no-op: it emits a single error `StreamEvent`
   to signal that no remote model is configured.
2. Searches the injected factories for one whose `name` matches the requested
   provider. Unknown names raise an error so misconfiguration is caught early.
3. Delegates to the matched factory to instantiate the adapter with the
   supplied credentials (`apiKey`, `baseUrl`, headers, etc.).

`listModels(config)` follows the same lookup rules, allowing callers to query
provider-specific model catalogs without worrying about the underlying client.

## Response format selection

Adapters call `resolveResponseFormat(options)` before issuing a request. The
helper inspects the `StreamOptions` passed into `ProviderAdapter.stream()` and
returns the first applicable format:

1. If `options.responseFormat` is provided explicitly, it is used verbatim.
2. Otherwise the helper searches for the first tool schema that exposes an
   `outputSchema`. When present, the schema is forwarded so providers that
   support structured outputs (OpenAI JSON modes, Anthropic tool schemas, etc.)
   can validate results.

Because `resolveResponseFormat` falls back to tool schemas, adding an
`outputSchema` to any `ToolSchema` automatically requests structured responses
without requiring per-provider configuration.

## Notification event extraction

Providers may stream auxiliary events (rate-limit notices, system messages,
trace hooks) alongside content deltas. `extractNotificationEvents` accepts the
raw provider payload and walks the object tree depth-first:

- Any `notification` property or `notifications` array is converted into a
  `StreamEvent` with `type: "notification"`.
- Nodes whose `type` string contains `notification` are also emitted, with the
  rest of the object forwarded as the payload.
- Metadata from the closest `metadata` object is propagated to every emitted
  notification so downstream surfaces retain correlation IDs or timestamps.
- Values are de-duplicated through a `Set` to avoid infinite recursion and to
  prevent the same object from being emitted twice.

When no matching fields are present the helper returns an empty array, making
it a no-op for payloads that do not encode notifications. This keeps adapter
loops simple: they always concatenate the returned events into their stream
without additional checks.
