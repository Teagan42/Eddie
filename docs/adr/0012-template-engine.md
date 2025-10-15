# ADR 0012: Template Engine Selection and Jinja Adoption

## Status

Accepted

## Context

Prompt orchestration relies on templating so agents can blend runtime context, chat history, and configuration variables. Early experiments rendered inline strings with ad-hoc `${}` substitution which broke once templates needed loops or partials. We evaluated several Node-oriented templating engines to support reusable prompt libraries across CLI, API, and web deployments.

## Decision

We standardised on a Jinja-compatible syntax backed by the `nunjucks` renderer exposed through `TemplateRendererService` in `@eddie/templates`. Jinja's `{% if %}`, `{% for %}`, and `{{ variable }}` expressions are already familiar to prompt engineers, and Nunjucks provides a mature implementation in TypeScript that mirrors Jinja semantics while running inside Node. The service caches compiled templates, resolves search paths from descriptor metadata, and exposes `renderTemplate` and `renderString` so hosts can load prompts from disk or inline configuration.

## Consequences

- Teams can share prompt snippets across languages because the syntax matches the broader Jinja ecosystem, with a manageable learning curve for contributors who already use Python tooling.
- Template caching keeps repeated renders fast even when prompts read from the filesystem, and cache invalidation keys ensure updates propagate when files change.
- The renderer centralises error handling and encoding defaults, preventing each surface from reimplementing IO guards.

## Alternatives Considered

- **Handlebars** – rejected; while popular, it lacks native control blocks and would require helper proliferation to match Jinja feature parity.
- **Mustache/Nunjucks hybrids** – rejected because maintaining compatibility layers on top of Jinja-like syntax complicated debugging and editor support.
