# ADR 0003: Align IO Services with Nest Naming Conventions

## Status

Accepted

## Context

The IO layer exposed several injectable services (`LoggerService`, `ConfirmService`,
`JsonlWriterService`, and `StreamRendererService`) whose filenames predated our move to
Nest-style `*.service.ts` conventions. Consumers imported each service directly from a
specific file path (for example `../../io/logger`), which coupled callers to the concrete
filenames and made cross-module refactors cumbersome. The lack of a barrel file also
prevented concise imports such as `import { LoggerService } from "../../io";`.

## Decision

We renamed the IO service files to `*.service.ts` variants (`logger.service.ts`,
`jsonl-writer.service.ts`, `stream-renderer.service.ts`, and `confirm.service.ts`) and
updated the `IoModule` to reference the new filenames. A new `src/io/index.ts` barrel
re-exports these services (and the module) so that downstream modules import from the
directory root instead of individual files. All existing consumers—including the engine
module, context module, and CLI context command—now leverage the barrel exports.

## Consequences

- The IO services now follow Nest naming conventions, improving discoverability and
  aligning with the rest of the codebase.
- Future reorganisations of the IO directory can happen behind the barrel without
  touching every consumer import statement.
- Tooling and documentation that referenced the previous filenames may need to be
  updated, but runtime behaviour remains unchanged.
