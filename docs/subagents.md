# Subagents

Eddie's agent orchestrator lets the root "manager" delegate work to nested
subagents. Each subagent receives its own prompt, optional context resources,
tool set, and runtime variables so that specialised workers can tackle
self-contained tasks while the manager coordinates the overall plan.

## Configuration overview

Subagents are defined in the `agents` block of `eddie.config.json`/`yaml` (or any
merged configuration source). The manager prompt remains the entrypoint, and
subagents can be declared alongside routing metadata and feature flags.

```yaml
agents:
  mode: router
  enableSubagents: true
  manager:
    promptTemplate:
      file: prompts/manager.jinja
  subagents:
    - id: summariser
      name: Context summariser
      description: "Pull key findings from repo files"
      promptTemplate:
        file: prompts/summariser.jinja
      resources:
        - type: bundle
          id: repo-files
          include: ["src/**/*.ts"]
      tools: ["file_read"]
      routingThreshold: 0.35
    - id: planner
      prompt: "You are the planning specialist for this session."
      tools: ["bash", "file_read", "file_write"]
  routing:
    confidenceThreshold: 0.5
    maxDepth: 3
```

The `mode` flag selects the orchestration strategy (for example `single` for a
stand-alone agent or `router` for multi-agent fan-out) and can also be provided
via `--agent-mode` at the CLI.【F:platform/core/config/src/config.service.ts†L623-L638】【F:apps/cli/src/cli/cli-parser.service.ts†L20-L44】

### Provider profiles

Agents may bind to different model providers by declaring a `providers` catalog
at the top level of the Eddie config. Each profile bundles a provider adapter
configuration (name, base URL, API key, etc.) with an optional default model
string. The manager and each subagent can then reference a profile by ID or
inline override their provider settings.【F:platform/core/types/src/config.ts†L105-L139】

```yaml
provider:
  name: openai
  apiKey: ${OPENAI_API_KEY}
model: gpt-4o
providers:
  anthropic-us:
    provider:
      name: anthropic
      apiKey: ${ANTHROPIC_API_KEY}
    model: claude-3-haiku-20240307
  openrouter-gpt4o:
    provider:
      name: openrouter
      baseUrl: https://openrouter.ai/api/v1
      apiKey: ${OPENROUTER_API_KEY}
```

When resolving runtime settings the engine clones the base provider, merges in
CLI overrides (for example `--provider anthropic-us` or `--provider
custom-name`), and applies any per-agent selections. Referencing a known profile
copies its adapter options and default model, while custom strings fall back to
the base provider name so ad-hoc endpoints remain reachable.【F:platform/core/config/src/config.service.ts†L437-L449】【F:platform/core/config/src/config.service.ts†L533-L547】【F:apps/cli/src/core/engine/engine.service.ts†L355-L460】

Subagents may set `provider: <profile>` or supply an inline object:

```yaml
agents:
  manager:
    provider: anthropic-us
  subagents:
    - id: summariser
      provider: openrouter-gpt4o
    - id: planner
      provider:
        name: azure-openai
        baseUrl: https://contoso.openai.azure.com
        apiKey: ${AZURE_KEY}
      model: gpt-4o-mini
```

The engine builds a runtime catalog that materialises each agent with its own
provider adapter, model, and metadata (such as the selected profile ID), so
delegated calls are routed through the intended backend.【F:apps/cli/src/core/engine/engine.service.ts†L355-L524】【F:apps/cli/src/core/agents/agent-runtime.types.ts†L1-L24】

### Manager vs. subagent definitions

Managers and subagents share the same shape: they support inline prompts or Jinja
templates, default user prompt templates, template variables, and resource
attachments. These are validated through the configuration service, ensuring
each agent receives clean copies of prompt descriptors, variables, and context
resource definitions.【F:platform/core/types/src/config.ts†L168-L195】【F:platform/core/config/src/config.service.ts†L641-L703】

Subagents extend this with optional `tools` (a whitelist applied before
invocation) and a `routingThreshold` that downstream router implementations can
use to gate automatic delegation.【F:platform/core/types/src/config.ts†L181-L195】 The list of
subagents is cloned during config resolution so each invocation starts with a
fresh definition.【F:platform/core/config/src/config.service.ts†L729-L827】

### Prompt template examples

Prompt templates can be stored as Jinja (`.jinja`) files or provided inline. The
following snippets show a manager and subagent pairing that pass variables via
the standard template context (`promptTemplate.variables`).

**`prompts/manager.jinja`**

```jinja
{% extends '../layouts/base.jinja' %}
{% block content %}
{% include '../partials/run-context.jinja' %}

You are {{ managerName }}, the lead coordinator.
Break the requested work into milestones and decide whether the
`summariser` or `planner` subagent is the best fit. Provide:

1. A short analysis of the task.
2. Which subagent should take the next step and why.
3. The payload (messages, commands, or files) the subagent needs.

Only delegate if you have high confidence that the subagent can progress the
task; otherwise, reply with a manager action plan.
{% endblock %}
```

**`prompts/summariser.jinja`**

```jinja
{% extends '../layouts/base.jinja' %}

{% block content %}
You are a repository summariser specialising in TypeScript projects.
Focus on the files provided in `{{ bundleName }}` and capture:

- High-level purpose of each module.
- Dependency injection patterns and NestJS providers involved.
- Any logging, middleware, or guard hooks worth surfacing.

Format the response as markdown with sections for "Overview", "Risks", and
"Next steps".
{% endblock %}
```

To keep templates DRY you can factor shared chrome into layouts and partials.
The manager snippet above expects a base layout and a `run-context` partial,
which could look like the following:

**`docs/examples/prompts/layouts/base.jinja`**

```jinja
<!DOCTYPE markdown>
{% set layout_config = layout or {} %}
{% set title = layout_config.title or 'Agent prompt' %}
{% set audience = layout_config.audience or 'subagent' %}
{% set instructions = layout_config.instructions or [] %}
{% set footer = layout_config.footer or [] %}
{% if title %}
# {{ title }}
{% endif %}

{% if audience %}
_Target audience: {{ audience }}_
{% endif %}

{% if instructions %}
## Operating instructions
{% for line in instructions %}
- {{ line }}
{% endfor %}
{% endif %}

{% include '../partials/run-context.jinja' %}

{% block content %}
<!-- Child template should provide body content -->
{% endblock %}

{% if footer %}
---
{% for line in footer %}
- {{ line }}
{% endfor %}
{% endif %}
```

**`docs/examples/prompts/partials/run-context.jinja`**

```jinja
{% if run %}
## Run context

{% if run.goal %}
- **Goal:** {{ run.goal }}
{% endif %}
{% if run.step %}
- **Current step:** {{ run.step }}
{% endif %}
{% if run.constraints %}
- **Constraints:**
{% for constraint in run.constraints %}
  - {{ constraint }}
{% endfor %}
{% endif %}
{% if run.files %}
- **Files available:**
{% for file in run.files %}
  - {{ file.path }} ({{ file.purpose or 'context' }})
{% endfor %}
{% endif %}
{% endif %}
```

### Routing controls

Global routing metadata lives under `agents.routing` and supports a
`confidenceThreshold` (0–1) and `maxDepth` (nested levels allowed). Both fields
are validated during config merge to guard against invalid values, ensuring the
orchestrator does not recurse unexpectedly.【F:platform/core/config/src/validation/config-validator.ts†L334-L352】【F:platform/core/config/src/config.service.ts†L729-L827】

Individual subagents may also supply `routingThreshold` hints so a router can
pick the most relevant candidate when confidence scores are available (for
example when using semantic routing or classification). This is optional but can
help prevent low-signal branches.【F:platform/core/types/src/config.ts†L181-L195】

### Runtime controls

At execution time the CLI exposes several toggles:

- `--agent-mode <id>` switches the orchestrator profile without editing config
  files.【F:apps/cli/src/cli/cli-parser.service.ts†L20-L44】
- `--disable-subagents` flips `agents.enableSubagents` to `false` for the
  current run, forcing the manager to operate alone even if definitions are
  present.【F:apps/cli/src/cli/cli-parser.service.ts†L27-L44】【F:platform/core/config/src/config.service.ts†L632-L638】

### Delegating with `spawn_subagent`

When subagents are enabled the orchestrator automatically exposes a virtual
`spawn_subagent` tool to the LLM. The tool schema lists the available subagent
IDs (and friendly names/descriptions when provided) and accepts the following
payload:

```json
{
  "agent": "summariser",
  "prompt": "Summarise the new authentication middleware",
  "variables": { "target": "src/auth/middleware.ts" },
  "metadata": { "reason": "High traffic alert" }
}
```

If the model calls this tool the orchestrator validates the request, spawns the
referenced subagent, and returns the child transcript summary as a structured
tool result (including profile metadata when present). Downstream hooks and
traces receive the delegation details so observers can audit which provider and
model handled each child run.【F:apps/cli/src/core/agents/agent-orchestrator.service.ts†L23-L213】【F:apps/cli/src/core/agents/agent-orchestrator.service.ts†L420-L760】

LLMs can also "suggest" delegation conversationally, but only an explicit
`spawn_subagent` call triggers execution—no separate CLI tool registration is
required since the orchestrator injects the schema at runtime.【F:apps/cli/src/core/agents/agent-orchestrator.service.ts†L213-L340】【F:apps/cli/src/core/agents/agent-orchestrator.service.ts†L500-L624】

### Lifecycle hooks

Subagent invocations raise the same hook events as root agents. When a nested
agent finishes, the orchestrator emits the `subagentStop` event with metadata
about the agent ID, depth, prompt, and context summary. Custom hook modules can
listen for this signal to capture transcripts, approvals, or metrics per
subagent.【F:apps/cli/src/hooks/types.ts†L1-L102】

## Best practices

- **Keep scopes tight.** Use `resources` or prompt templates to feed each
  subagent just the files it needs rather than the entire workspace.
- **Choose tools deliberately.** Restrict subagent `tools` to prevent accidental
  writes or command execution when a read-only worker is sufficient.
- **Monitor delegation.** Pair routing thresholds with hooks so low-confidence
  branches can be reviewed or vetoed before they run.
- **Fail gracefully.** Consider setting conservative `maxDepth` values and using
  the structured trace output to diagnose runaway delegation.

With these patterns, subagents remain a powerful yet predictable way to split
complex CLI sessions into focused, auditable tasks.
