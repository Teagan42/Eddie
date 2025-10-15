# ADR 0010: API Persistence Layer and Multi-Database Support

## Status

Accepted

## Context

Chat sessions, tool results, and runtime configuration now require durable storage so that the API can coordinate long-running agent workflows. Early prototypes stored everything in memory via `InMemoryChatSessionsRepository`, which limited horizontal scaling and made it impossible to inspect audit trails after a process restart. Platform deployments also needed flexibility to point the API at Postgres, MySQL, or embedded SQLite depending on operational constraints, effectively demanding polyglot persistence across environments.

## Decision

We standardised on a persistence abstraction centred on `ChatSessionsRepository` with a Knex-backed implementation. The `KNEX_PROVIDER` resolves a driver-specific client at runtime based on `@eddie/config` settings, creating PostgreSQL (`pg`), MySQL (`mysql2`), MariaDB, or SQLite connections. Migrations execute through the shared repository bootstrap so all adapters stay in sync. Prisma remained the primary alternative, but we kept the Knex approach because it exposes raw SQL for CQRS handlers and matches the lightweight configuration service we already ship.

## Consequences

- Operators can toggle `api.persistence.driver` between memory, sqlite, postgres, mysql, and mariadb without recompiling the API, trading some operational overhead for portability.
- Repository tests exercise both the in-memory fake and the SQL-backed implementation, catching differences in JSON column handling before they reach production.
- Configuration validation in `packages/config` now enforces connection metadata for each SQL driver, surfacing misconfigurations at startup instead of during traffic spikes.

## Alternatives Considered

- **single database vendor** – rejected; choosing only Postgres would simplify migrations but fail to serve edge deployments that demand file-backed SQLite or existing MySQL fleets.
- **Prisma ORM** – deferred; although Prisma offers schema tooling, it introduces its own migration workflow and binary engines that conflict with the lean container images used by CLI-managed clusters.
