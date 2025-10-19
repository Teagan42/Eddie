# Built-in tool workflows

Eddie ships with a curated registry of helpers that provide common automation
capabilities out of the box. This guide explains how the plan-aware tools work
in tandem and how to safely invoke the file discovery helpers that power most
code-editing loops.

## Plan management tools: `get_plan`, `update_plan`, `complete_task`

Plan files live alongside your workspace so the agent can checkpoint progress
between runs. By default the runtime stores the active document at
`.eddie/plan.json`, but the loader honours two configuration hooks when
resolving the location:

- The `CONFIG_ROOT` environment variable, when present, re-roots configuration
  discovery before any files are read.
- Inside the resolved config (`eddie.config.*` or `.eddierc`), the
  `plan.directory` and `plan.filename` settings override the default `.eddie`
  directory and `plan.json` filename.

The plan helpers share a single implementation in
[`platform/runtime/tools/src/builtin/plan.ts`](../platform/runtime/tools/src/builtin/plan.ts).
That module defines the `PlanDocument`, `PlanTask`, and `PlanTaskStatus` types
that structure the stored file, plus the `PLAN_RESULT_SCHEMA` that describes the
JSON payload emitted back to the agent after each tool call. Plans are simple
arrays of tasks with titles, statuses (`pending`, `in_progress`, or
`complete`), and optional `details` fields. The runtime tracks the timestamp of
the last update in the `updatedAt` property so downstream automations can decide
when a plan has changed.

The workflow for the three tools is:

1. `get_plan` loads and validates the current document, returning the full
   structure described by `PLAN_RESULT_SCHEMA`. If the plan does not exist the
   runtime creates an empty document in the configured directory.
2. `update_plan` accepts partial task lists and replaces the stored document,
   allowing agents to reorder work or expand task descriptions while preserving
   metadata.
3. `complete_task` flips the targeted entry to `complete` (and maintains the
   `completed` boolean for backwards compatibility), optionally appending a note
   so human reviewers understand the resolution.

All three tools sanitise file names to keep writes inside the workspace root,
ensuring hostile input cannot escape the configured directory.

## File discovery helpers: `file_search` and `get_folder_tree_structure`

The file discovery helpers expose read-only views of the workspace. Their JSON
schemas live in the runtime next to their implementations so you can inspect
available options directly:

- [`platform/runtime/tools/src/builtin/file_search.ts`](../platform/runtime/tools/src/builtin/file_search.ts)
- [`platform/runtime/tools/src/builtin/get_folder_tree_structure.ts`](../platform/runtime/tools/src/builtin/get_folder_tree_structure.ts)

### `file_search`

`file_search` scans the workspace for matching files and returns paginated
results. The JSON schema exposes filters you can mix and match:

- `root`: start directory (defaults to `.`).
- `content`: Unicode-aware regular expression applied to file bodies.
- `name`: Unicode-aware regular expression that must match the basename.
- `include` / `exclude`: arrays of regular expressions that whitelist or block
  relative paths before content matching runs.
- `includeDependencies`: `false` by default so dependency folders such as
  `node_modules` remain hidden; flip to `true` when you need third-party code.
- `page` and `pageSize`: paginate large result sets deterministically so the
  agent can request subsequent slices without missing matches.

The response includes `totalResults`, `page`, `pageSize`, and `totalPages`
fields, letting callers loop through pages without guessing.

### `get_folder_tree_structure`

`get_folder_tree_structure` renders a directory tree without touching file
contents. Its schema mirrors the plan-friendly pagination and dependency
controls:

- `path`: root directory (defaults to `.`).
- `maxDepth`: limit recursion depth to keep payloads concise.
- `includeHidden`: opt in to dotfiles and dot-directories when required.
- `includeDependencies`: default `false`; when `true` the runtime stops filtering
  dependency folders, matching `file_search` behaviour.
- `maxEntries` and `offset`: paginate large trees for deterministic traversal.

Responses include the pagination summary described in the implementation file,
so UI surfaces can display counts while agents fetch more entries.
