# @eddie/ci-support

## Purpose

Utility helpers for CI pipelines that need to understand the Eddie monorepo. The package
loads workspace metadata, derives job matrices for lint/build/test steps, and maps changed
files back to the affected packages.

## Installation

```bash
npm install @eddie/ci-support
```

The package is framework agnostic and ships pure TypeScript helpers compiled to ESM.

## API Reference

- `loadWorkspaces()` – returns every workspace entry from `workspaces.json`, including
  lint/test coverage output paths and optional prebuild scripts.
- `getWorkspaceByName(name)` – fetches a single workspace definition, throwing when the
  package name is unknown.
- `selectWorkspaceNamesForPaths(paths)` – maps a list of changed file paths to the
  workspaces they touch, always including app workspaces so deployment checks continue to
  run.
- `loadWorkspaceMatrix(job, options?)` – produces the matrix payload for GitHub Actions
  jobs. Lint and test jobs honour the `changedWorkspaces` filter while build jobs run across
  every workspace.

Each helper returns copies of the metadata so callers can mutate them freely without
impacting the shared cache.

## Usage Examples

### Building a GitHub Actions matrix

```ts
import { loadWorkspaceMatrix } from "@eddie/ci-support";

const matrix = loadWorkspaceMatrix("test", {
  changedWorkspaces: ["@eddie/api-client", "@eddie/context"],
});

// matrix => { "node-version": ["20.x", "22.x"], workspace: [...] }
```

### Selecting workspaces from changed paths

```ts
import { selectWorkspaceNamesForPaths } from "@eddie/ci-support";

const workspaces = selectWorkspaceNamesForPaths([
  "platform/runtime/api-client/src/index.ts",
  "apps/web/src/main.tsx",
]);
// => ["apps/web", "@eddie/api-client"]
```

## Testing

Run the Vitest suite to validate matrix generation logic whenever you update the
workspace catalog:

```bash
npm run test --workspace @eddie/ci-support
```
