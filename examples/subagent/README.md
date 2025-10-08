# Subagent NestJS triage router

This scenario demonstrates Eddie's router mode with a triage manager that can
delegate to two specialised subagents:

- **planner** – crafts dependency-aware implementation plans.
- **qa** – audits guards, interceptors, filters, and testing coverage.

The Eta templates reuse a shared layout plus partials for the backlog briefing
and run state so every agent receives consistent context, while `swimlane`
variables tailor the guidance for each specialist.

## How to run

Execute the following from the repository root:

```bash
eddie run --config examples/subagent/eddie.config.yaml
```

## Scenario highlights

- **Router orchestration:** The manager evaluates each request before choosing a
  subagent, using routing thresholds to avoid low-confidence delegations.
- **Template reuse:** Manager and subagents share the same layout and partials,
  showcasing how Eta templates keep instructions DRY while exposing shared
  variables like `briefing`, `run`, and `swimlane`.
- **NestJS coverage:** Prompts focus on DI wiring, middleware, guards, pipes,
  interceptors, logging, caching, testing with Jest, and API documentation so
you can stress-test a production-ready service design.
