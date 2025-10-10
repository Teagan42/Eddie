# Standalone NestJS architecture audit

This example spins up a single Eddie agent that operates as a senior NestJS
architect. The prompts emphasise Dependency Injection boundaries, module design,
middleware coverage, and the supporting Jest tests so you can review a service
before shipping a new feature.

## How to run

From the repository root execute:

```bash
eddie run --config examples/standalone/eddie.config.yaml
```

The configuration loads the Jinja templates in `examples/standalone/prompts/` and
scopes context collection to the repository `src/` and `docs/` trees so the
reviewer can cross-reference implementation details with the documentation.

## Scenario highlights

- **Single agent:** No subagents are defined; the manager prompt guides the solo
  reviewer to produce actionable recommendations.
- **Reusable templates:** System and user prompts share a layout and partials so
  you can see how shared variables (`layout`, `focus`, `questions`) keep the
  prompts DRY while surfacing repository context.
- **NestJS focus:** Instructions call out DI patterns, module organisation,
middleware, guards, interceptors, pipes, and Jest coverage to align with the
engineering checklist used by the Eddie maintainers.
