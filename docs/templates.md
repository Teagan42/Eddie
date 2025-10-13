# Prompt and Context Templates

Eddie renders prompts and context resources with a Jinja templating engine. The
runtime understands the full family of Jinja control structures—`{% set %}`,
`{% if %}`, `{% for %}`, `{% include %}`, `{% extends %}`—so you can build
layouts, partials, and inline snippets that mirror popular Python workflows.
Templates can live in dedicated files or inline strings and use `{{ ... }}`
expressions for dynamic values.

## Prompt Templates

Agent prompts can be sourced from template files by declaring descriptors inside
`agents.manager.promptTemplate` or individual subagent entries. Each descriptor
accepts a `file` path (relative to `baseDir` when provided) and optional default
`variables`.

```jsonc
{
  "agents": {
    "manager": {
      "promptTemplate": {
        "file": "prompts/system.jinja",
        "baseDir": "./config",
        "variables": { "product": "workspace" }
      },
      "defaultUserPromptTemplate": {
        "file": "prompts/user.jinja"
      },
      "variables": {
        "owner": "docs-team"
      }
    }
  }
}
```

At runtime `AgentInvocationFactory` resolves both the system and user prompts by
merging variables in the following order:

1. Built-in metadata (agent id, parent id, current context, chat history, raw
   prompt, and previously rendered system prompt).
2. Variables declared on the agent definition (`agents.*.variables`).
3. Variables supplied for a specific invocation (`AgentInvocationOptions.variables`).

This merged bag is available to system and user prompt templates, enabling rich
contextualisation (for example `{{ context.text }}` or `{{ history | length }}`).

If no template descriptor is present, inline prompt strings are still rendered
with the same Jinja engine so you can use expressions directly inside
configuration files.

## Context Resources

`ContextService` can bundle additional resources into the packed workspace
context. By default it will gather up to **64 files** (focused on text
extensions) while staying under a **250,000 bytes** budget, applying a set of
include patterns that
cover source code, configuration, and documentation alongside sensible ignores
like `node_modules`, build artifacts, and caches. Override `maxFiles`,
`maxBytes`, `include`, or `exclude` inside your configuration to tighten or
loosen those defaults when a workflow needs more (or less) context. Resources
are declared under `context.resources` and support two flavours:

- `bundle` – glob selected files, optionally applying a virtual path prefix.
- `template` – render a synthetic resource from a template file.

```jsonc
{
  "context": {
    "include": ["src/**/*.ts"],
    "maxFiles": 32,
    "maxBytes": 150000,
    "resources": [
      {
        "type": "bundle",
        "id": "playbooks",
        "name": "Runbooks",
        "include": ["playbooks/*.md"],
        "virtualPath": "docs"
      },
      {
        "type": "template",
        "id": "summary",
        "template": { "file": "templates/summary.jinja" },
        "variables": { "scope": "authentication" }
      }
    ]
  }
}
```

Rendered resources are appended to the packed context (`PackedContext.text`) in
named sections, preserving metadata such as IDs and virtual paths. Bundle
resources expose their constituent files via `PackedResource.files` and capture a
`metadata.virtualPath` when a prefix is supplied so downstream systems can
inspect size and provenance. The stitched `context.text` output resembles the
following, making it easy to audit what the agent received:

```text
// File: src/example.ts
export function greet(name: string) {
  return `Hello, ${name}!`;
}
// End of src/example.ts

// Resource: Runbooks - Troubleshooting guides
## Deployment checks
- Verify migrations
- Confirm health probes
// End Resource: Runbooks
```

## Available Variables

The renderer exposes the following built-ins in addition to any configured
variables:

- `agent.id` – the current agent identifier.
- `parent.id` – parent agent identifier when applicable.
- `prompt` – the raw user prompt before templating.
- `systemPrompt` – the fully rendered system prompt (available to user templates).
- `context` – the packed workspace context (`files`, `resources`, `text`).
- `history` – the prior chat messages.

These defaults make it straightforward to build composable prompt libraries that
adapt to runtime state without repeating boilerplate across configurations.
