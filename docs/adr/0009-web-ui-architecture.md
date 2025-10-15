# ADR 0009: Web UI Architecture and Component Structure

## Status

Accepted

## Context

The React web client under `apps/web` grew organically while we were adding chat, configuration, and telemetry surfaces. Without a clear component hierarchy the same stateful hooks were reimplemented in multiple pages, layout primitives leaked into feature components, and theming with Radix UI tokens was inconsistently applied. As more teams contribute new panels and diagnostics, the UI needed a documented structure that keeps routing, state management, and presentation layers maintainable.

## Decision

We formalised the Web UI architecture around three layers:

- **Pages** (`apps/web/src/pages`) own routing, compose feature-specific providers such as `useChatMessagesRealtime`, and orchestrate data fetching through React Query.
- **Feature hooks** (`apps/web/src/hooks` and feature-local hooks) encapsulate API calls via the shared `ApiProvider`, caching behaviour, and websocket lifecycles so pages remain declarative.
- **Reusable components** (`apps/web/src/components`) split into `layout`, `navigation`, and `common` folders that expose Radix-themed building blocks (for example `AppHeader`, `NavigationLink`, and `Panel`).

Shared context such as authentication and API clients continues to be registered at the root in `main.tsx`, while Tailwind utilities live under `styles/` to provide consistent typography. This structure keeps stateful logic near the domain surface and allows the design system to evolve without page rewrites.

## Consequences

- Contributors can locate presentation code quickly, improving onboarding time and long-term maintainability of the React surface.
- Feature work now prefers composing hooks and components instead of duplicating fetch calls or websocket wiring, reducing regressions in chat updates and analytics panels.
- Documentation and tests (e.g. `apps/web/src/components/index.test.ts`) reference the agreed folders, providing early signals when the hierarchy drifts.

## Alternatives Considered

- **single monolith page component** – rejected because centralising state and layout would have made incremental feature delivery impossible and created untestable components.
- **Co-locating hooks and components per feature tree** – deferred; while attractive for vertical slices, it complicated reuse across shared panes like the app header and navigation.
