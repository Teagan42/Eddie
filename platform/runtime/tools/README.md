# @eddie/tools

## Built-in tools

### `bash`
#### Parameters
- `command` (required): shell command executed via `child_process.exec`.
- `timeoutMs` (default `15000`): aborts long-running commands before they hang the agent.
- `cwd`: workspace-relative directory for execution. The handler resolves the path against the current workspace root.
- `maxBytes` (default `512000`): caps combined stdout/stderr buffering to avoid runaway output.

#### Outputs
- `stdout`: UTF-8 output captured from the command.
- `stderr`: UTF-8 error stream captured from the command.
- `content`: mirrors either `stdout`, `stderr`, or `(no output)` for simplified logging.

#### Safety considerations
- The handler in [`platform/runtime/tools/src/builtin/bash.ts`](./src/builtin/bash.ts) calls `ctx.confirm` so a confirmation prompt must succeed before the command runs.
- `cwd` is validated to remain inside the workspace so commands cannot escape the sandbox.
- `maxBytes` is clamped to the default ceiling, preventing memory pressure from unbounded output.

### `file_read`
#### Parameters
- `path` (required): workspace-relative file location.
- `maxBytes`: legacy alias for `pageSize`; both values respect UTF-8 boundaries.
- `page` (default `1`): 1-indexed page of the file to load.
- `pageSize` (default `20 KiB`): number of bytes to read per page.

#### Outputs
- `content`: UTF-8 slice of the requested page.
- `path`: echo of the requested path for tracing.
- `bytes`, `truncated`: report how much data was returned and whether more content exists.
- `page`, `pageSize`, `totalBytes`, `totalPages`: pagination summary for incremental reads.

#### Safety considerations
- Reads happen through `fs.open` and trim to the nearest UTF-8 boundary, eliminating malformed characters.
- Offsets snap to whole code points so repeated paging never corrupts multi-byte sequences.
- Paths are resolved relative to the workspace root before opening files.

### `file_write`
#### Parameters
- `path` (required): workspace-relative file location to create or overwrite.
- `content` (required): UTF-8 payload written to disk.

#### Outputs
- `path`: echo of the written relative path.
- `bytesWritten`: size of the UTF-8 payload persisted.
- `content`: confirmation message describing the action.

#### Safety considerations
- [`platform/runtime/tools/src/builtin/file_write.ts`](./src/builtin/file_write.ts) requires a `ctx.confirm` confirmation prompt before any bytes are written.
- The handler creates missing parent directories with `fs.mkdir` so agents do not need to pre-seed folders.
- All writes resolve against the workspace root, preventing directory traversal outside the project.

### `file_search`
#### Parameters
- `root` (default `.`): starting directory for the search.
- `content`: Unicode-aware regular expression applied to file bodies.
- `name`: Unicode-aware regular expression matched against basenames.
- `include` / `exclude`: arrays of regex strings used to whitelist or block relative paths.
- `includeDependencies` (default `false`): opt into dependency directories such as `node_modules`.
- `page` (default `1`) and `pageSize` (default `20`): paginate deterministic search results.

#### Outputs
- `results`: ordered array of relative paths with per-line match metadata.
- `totalResults`, `page`, `pageSize`, `totalPages`: pagination summary for iterating over matches.
- `content`: sentence summarising match counts for status displays.

#### Safety considerations
- Regex patterns are compiled with the Unicode flag; invalid patterns raise structured errors before any files are read.
- Dependency-heavy directories remain excluded unless `includeDependencies` is explicitly enabled.
- Results are normalised to POSIX separators and sorted for deterministic pagination.

### `get_folder_tree_structure`
#### Parameters
- `path` (default `.`): workspace-relative root of the tree.
- `maxDepth`: recursion depth limit (0 lists the root only).
- `includeHidden` (default `false`): opt in to dotfiles and dot-directories.
- `includeDependencies` (default `false`): include dependency folders when required.
- `maxEntries` (default `200`): maximum number of flattened entries returned per page.
- `offset` (default `0`): index into the flattened entry list for pagination.

#### Outputs
- `root`: normalised display path for the tree.
- `entries`: nested directory tree with sub-entries.
- `pageEntries`: flattened string list for quick display or pagination.
- `pagination`: metadata describing offsets, limits, and whether more entries remain.
- `content`: header summarising the tree and pagination window.

#### Safety considerations
- Dependency folders are excluded unless `includeDependencies` is enabled, mirroring `file_search` defaults.
- Entries are sorted using locale-aware comparisons for stable diffs.
- Pagination ensures large trees do not overload downstream displays.

### `get_plan`
#### Parameters
- `abridged` (default `false`): returns a concise textual summary when `true`.
- `filename`: optional override for the stored plan filename.

#### Outputs
- `plan`: the parsed `PlanDocument` structure with tasks and metadata.
- `abridged`: echoes the summary flag used when rendering.
- `content`: human-readable rendering of the plan for logs.

#### Safety considerations
- Filenames are sanitised via the shared helpers in [`platform/runtime/tools/src/builtin/plan.ts`](./src/builtin/plan.ts) to remain inside the workspace.
- Missing plan files are created lazily, ensuring repeated reads stabilise quickly.
- The loader validates schema compliance before returning the plan document.

### `complete_task`
#### Parameters
- `taskNumber` (required): 1-indexed task identifier to mark complete.
- `abridged` (default `false`): returns condensed textual output when enabled.
- `filename`: optional override for the plan filename.

#### Outputs
- `plan`: updated `PlanDocument` after marking the task complete.
- `abridged`: echo of the summary flag.
- `content`: textual rendering that highlights completion state.

#### Safety considerations
- Task indices are validated to reference an existing entry before any writes occur.
- Plan filenames reuse the sanitisation provided by [`platform/runtime/tools/src/builtin/plan.ts`](./src/builtin/plan.ts).
- Only the targeted task’s status flips—other metadata remains untouched to preserve audit trails.

### `update_plan`
#### Parameters
- `tasks` (required unless `plan.tasks` provided): array of plan entries containing `title`, `status`, and optional `details`.
- `plan`: optional object wrapper carrying `tasks` plus additional metadata keys.
- `abridged` (default `false`): request condensed textual rendering.
- `filename`: override for the stored plan filename.

#### Outputs
- `plan`: persisted `PlanDocument` reflecting the supplied tasks and metadata.
- `abridged`: echo of the summary flag.
- `content`: textual rendering of the updated plan.

#### Safety considerations
- Task payloads are validated for required fields and status consistency before saving.
- A confirmation prompt via `ctx.confirm` defends against unintended plan rewrites.
- Sanitised filenames and shared helpers from [`platform/runtime/tools/src/builtin/plan.ts`](./src/builtin/plan.ts) confine writes to the workspace directory.
