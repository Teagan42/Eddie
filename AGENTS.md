# Eddie Contribution Overview

Eddie is a multi-surface agent platform comprising a Node.js CLI, a NestJS API, and supporting web tooling. Use this document as a map to deeper guides before making changes.

## Architecture at a Glance

- **CLI** – Launches agent workflows and streams tool interactions. See [`apps/cli/AGENTS.md`](apps/cli/AGENTS.md) for detailed architecture and testing notes.
- **API** – Provides hosted agent capabilities using NestJS modules, providers, and guards. Start with [`docs/api.md`](docs/api.md) for module layout, DI strategy, and testing guidelines.
- **Web & Companion Tools** – Front-end and supporting packages live under `apps/web`, `packages/`, and `examples/`. Check local `AGENTS.md` files or package READMEs when present.

## Shared Practices

- **Branching & Commits** – Create feature branches with the pattern `codex/<description>` and write [Conventional Commits](https://www.conventionalcommits.org/) for every change.
- **Architecture Decisions** – Record significant design choices as ADRs under `docs/adr/`, numbering them sequentially (`0001-*.md`, `0002-*.md`, ...).
- **Documentation Updates** – Whenever behaviour or configuration changes, update all relevant references: the README, `docs/examples`, `docs/mcp-servers.md`, `docs/subagents.md`, and any surface-specific guides.
- **Tooling Commands** – Use `npm` workspaces for linting, testing, and builds—`pnpm` must not be used anywhere in this repository. Run commands like `npm run lint --workspace <package>`, `npm run test --workspace @eddie/api`, and `npm run build --workspace <package>`.
- **Testing Discipline** – Add or update tests alongside behavioural changes. Prefer realistic fixtures and keep required dev dependencies declared so the full suite runs cleanly.
- **Public Interfaces** – Maintain JSDoc/TSdoc coverage for exported APIs and keep generated or human-authored docs in sync with code.

Following these shared expectations keeps each surface consistent while allowing specialised guides—such as the CLI and API references—to dive into implementation details.
