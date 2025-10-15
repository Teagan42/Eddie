# Eddie CLI option reference

Eddie's CLI collects flags in `CliParserService` and adapts them into engine runtime options, so every command (`ask`, `run`, `chat`, `context`, `trace`, etc.) accepts the same option surface area. The parser recognises aliases, boolean toggles, and repeated string arguments before `CliOptionsService` coalesces them into the configuration layer passed to the engine.【F:apps/cli/src/cli/cli-parser.service.ts†L8-L93】【F:apps/cli/src/cli/cli-options.service.ts†L5-L69】

## Parsing behaviour at a glance

- Non-boolean options accept values either by repeating the flag (`--context src --context test`) or by providing a comma-separated list (`--context src,test`), and the service normalises them into arrays before configuration merging.【F:apps/cli/src/cli/cli-parser.service.ts†L77-L90】【F:apps/cli/src/cli/cli-options.service.ts†L5-L68】
- Boolean toggles (for example `--auto-approve`) do not accept an explicit value; their presence sets the corresponding option to `true` during parsing.【F:apps/cli/src/cli/cli-parser.service.ts†L27-L66】
- Supplying `--no-context` short-circuits the context loader by clearing include patterns and budgets so no files are packed for the request.【F:apps/cli/src/cli/cli-options.service.ts†L44-L45】【F:apps/cli/src/config/config.service.ts†L236-L244】
- Setting logging, tracing, tool, or agent flags updates the merged runtime config, overriding any defaults loaded from configuration files or the built-in baseline.【F:apps/cli/src/config/config.service.ts†L251-L316】【F:apps/cli/src/config/defaults.ts†L10-L57】

## Flag reference

| Flag | Aliases | Type | Description | Default |
| --- | --- | --- | --- | --- |
| `--context` | `-C` | string[] | Overrides the glob patterns packed into the request context. Accepts repeated flags or comma-separated lists. Ignored when `--no-context` is present.【F:apps/cli/src/cli/cli-parser.service.ts†L8-L90】【F:apps/cli/src/config/config.service.ts†L236-L248】 | `src/**/*` from the default config.【F:apps/cli/src/config/defaults.ts†L15-L18】 |
| `--no-context` | – | boolean | Disables context collection entirely by clearing include patterns and budgets.【F:apps/cli/src/cli/cli-options.service.ts†L44-L45】【F:apps/cli/src/config/config.service.ts†L236-L244】 | Context enabled with defaults unless flag supplied.【F:apps/cli/src/config/defaults.ts†L15-L18】 |
| `--config` | `-c` | string | Points to a specific `eddie.config.(json|yaml)` file to load before applying overrides.【F:apps/cli/src/cli/cli-parser.service.ts†L11-L74】【F:apps/cli/src/cli/cli-options.service.ts†L26】 | Automatic discovery in project root if flag omitted (see `README`). |
| `--model` | `-m` | string | Overrides the model identifier used for the run.【F:apps/cli/src/cli/cli-parser.service.ts†L13-L74】【F:apps/cli/src/cli/cli-options.service.ts†L27】 | `gpt-4o-mini`.【F:apps/cli/src/config/defaults.ts†L10-L18】 |
| `--provider` | `-p` | string | Selects a provider profile by name; if the profile exists it also hydrates the associated model. Otherwise sets the provider name directly.【F:apps/cli/src/cli/cli-parser.service.ts†L15-L74】【F:apps/cli/src/config/config.service.ts†L220-L234】 | `openai`.【F:apps/cli/src/config/defaults.ts†L12-L14】 |
| `--tools` | `-t` | string[] | Restricts the enabled tool list to the provided identifiers.【F:apps/cli/src/cli/cli-parser.service.ts†L17-L90】【F:apps/cli/src/config/config.service.ts†L251-L255】 | `bash`, `file_read`, `file_write`.【F:apps/cli/src/config/defaults.ts†L35-L38】 |
| `--disable-tools` | `-D` | string[] | Marks the provided tools as disabled for the run while leaving the rest of the registry untouched.【F:apps/cli/src/cli/cli-parser.service.ts†L19-L90】【F:apps/cli/src/config/config.service.ts†L258-L262】 | No tools disabled by default.【F:apps/cli/src/config/defaults.ts†L35-L38】 |
| `--auto-approve` | – | boolean | Enables automatic approval of tool calls. Alias: `--auto`.【F:apps/cli/src/cli/cli-parser.service.ts†L27-L90】【F:apps/cli/src/cli/cli-options.service.ts†L48-L53】【F:apps/cli/src/config/config.service.ts†L265-L269】 | Manual confirmation required (`false`).【F:apps/cli/src/config/defaults.ts†L35-L38】 |
| `--auto` | – | boolean | Alias for `--auto-approve`; see above.【F:apps/cli/src/cli/cli-parser.service.ts†L27-L90】【F:apps/cli/src/cli/cli-options.service.ts†L48-L53】 | Same as `--auto-approve`. |
| `--non-interactive` | – | boolean | Runs commands without prompting for confirmations (useful for CI). When paired with `--auto-approve`, runs proceed without pauses.【F:apps/cli/src/cli/cli-parser.service.ts†L27-L90】【F:apps/cli/src/cli/cli-options.service.ts†L55-L67】 | Interactive prompts enabled by default.【F:apps/cli/src/config/defaults.ts†L35-L38】 |
| `--jsonl-trace` | – | string | Overrides the JSONL trace path for structured run logs.【F:apps/cli/src/cli/cli-parser.service.ts†L21-L74】【F:apps/cli/src/config/config.service.ts†L272-L276】 | `.eddie/trace.jsonl`.【F:apps/cli/src/config/defaults.ts†L30-L33】 |
| `--log-level` | – | string | Sets the logging level for the run and propagates it to the logger configuration.【F:apps/cli/src/cli/cli-parser.service.ts†L22-L74】【F:apps/cli/src/config/config.service.ts†L279-L287】 | `info`.【F:apps/cli/src/config/defaults.ts†L20-L29】 |
| `--log-file` | – | string | Writes structured logs to the specified file instead of standard output. Pretty-printing and colour are disabled when writing to files.【F:apps/cli/src/cli/cli-parser.service.ts†L23-L74】【F:apps/cli/src/config/config.service.ts†L289-L301】 | Logs stream to pretty stdout transport by default.【F:apps/cli/src/config/defaults.ts†L20-L29】 |
| `--agent-mode` | – | string | Switches the agent orchestration strategy (for example `single`, `manager`, or custom modes defined in config).【F:apps/cli/src/cli/cli-parser.service.ts†L24-L74】【F:apps/cli/src/config/config.service.ts†L303-L310】 | `single`.【F:apps/cli/src/config/defaults.ts†L46-L56】 |
| `--disable-subagents` | – | boolean | Prevents manager agents from spawning additional subagents during the run.【F:apps/cli/src/cli/cli-parser.service.ts†L27-L90】【F:apps/cli/src/config/config.service.ts†L308-L314】 | Subagents enabled (`true`).【F:apps/cli/src/config/defaults.ts†L46-L56】 |

## Usage examples

Combine flags to tailor agent behaviour for local runs, CI, or automated workflows:

```bash
# 1. Run the automation agent with non-interactive, auto-approved tool usage
eddie run "Ship the pending bugfix" --auto-approve --non-interactive

# 2. Swap to the manager/subagent profile while disabling shared context
eddie chat --agent-mode manager --disable-subagents --no-context

# 3. Target a Groq provider profile with custom tools and file logging
eddie ask "Draft release notes" \
  --provider groq \
  --model llama3-70b \
  --tools file_read,file_write \
  --disable-tools bash \
  --log-level debug \
  --log-file .eddie/run.log
```

These combinations layer on top of `eddie.config.*` and the defaults shown above, so they can be mixed-and-matched for repeatable execution environments.【F:apps/cli/src/config/config.service.ts†L236-L316】【F:apps/cli/src/config/defaults.ts†L10-L56】

## Command quick reference

### ask command

- Sends a single prompt to the engine and prints the streamed response.
- Requires one positional argument; otherwise the CLI throws `The ask command requires a prompt argument.` before the run starts.【F:apps/cli/src/cli/commands/ask.command.ts†L19-L27】
- Accepts all global flags listed above; combine with `--non-interactive` for CI-friendly automation.

### run command

- Alias for `ask` that preserves historical naming; also requires a positional prompt and surfaces the same error string when omitted.【F:apps/cli/src/cli/commands/run.command.ts†L19-L27】
- Use when scripting older tutorials or shell aliases that were written against `eddie run`.

### chat command

- Starts an interactive REPL that keeps message history between turns and sends it back to the engine so the conversation stays grounded.【F:apps/cli/src/cli/commands/chat.command.ts†L22-L55】
- Type `exit`, `quit`, or `q` to end the session without terminating the process abruptly.【F:apps/cli/src/cli/commands/chat.command.ts†L28-L56】
- Combine with `--agent-mode manager` or different tool sets to explore orchestration strategies mid-session.

### context command

- Loads the merged configuration, configures logging, and prints a preview of every file selected by the current context include/exclude rules.【F:apps/cli/src/cli/commands/context.command.ts†L25-L59】
- Reports totals for matched files, bytes, and approximate tokens so you can trim context before executing an expensive run.【F:apps/cli/src/cli/commands/context.command.ts†L41-L55】
- Emits `No context files matched the current configuration.` when your globs produce an empty set, making it easy to diagnose missing include patterns.【F:apps/cli/src/cli/commands/context.command.ts†L41-L44】

### trace command

- Reads the most recent entries from the JSONL trace file determined by CLI flags, environment variables, or configuration defaults and pretty-prints each record.【F:apps/cli/src/cli/commands/trace.command.ts†L24-L41】
- If the file cannot be opened (for example it has not been created yet) the command warns with `Unable to read trace at …` instead of crashing the process.【F:apps/cli/src/cli/commands/trace.command.ts†L42-L45】
- Pair with `--jsonl-trace` to inspect multiple concurrent runs without clobbering log streams.

## Environment variables and precedence

Precedence: CLI flags → `EDDIE_CLI_*` environment variables → configuration files → built-in defaults. `mergeCliRuntimeOptions` merges environment-derived options first and then overlays explicit flags, while the `ConfigService` composes provider defaults, on-disk configuration, and runtime overrides in that order.【F:packages/config/src/runtime-cli.ts†L1-L120】【F:packages/config/src/config.service.ts†L123-L133】【F:packages/config/src/config.service.ts†L145-L156】【F:packages/config/src/runtime-env.ts†L63-L152】

Environment variables map directly to the flag surface. Common examples include:

| Variable | Effect |
| --- | --- |
| `EDDIE_CLI_CONTEXT=src,tests` | Overrides context include globs until a flag is supplied.【F:packages/config/src/runtime-env.ts†L63-L141】 |
| `EDDIE_CLI_LOG_LEVEL=debug` | Sets the log level across CLI commands.【F:packages/config/src/runtime-env.ts†L63-L141】 |
| `EDDIE_CLI_JSONL_TRACE=/tmp/eddie.trace.jsonl` | Redirects trace output for subsequent `trace` or `run` invocations.【F:packages/config/src/runtime-env.ts†L63-L141】 |
| `EDDIE_CLI_AGENT_MODE=manager` | Enables the multi-agent orchestrator without editing configuration files.【F:packages/config/src/runtime-env.ts†L63-L141】 |

Shell interpolation keeps secrets and workspace-specific paths out of the repository:

```bash
export EDDIE_CLI_PROVIDER="${DEFAULT_PROVIDER:-openai}"
export EDDIE_CLI_JSONL_TRACE="${TMPDIR}/eddie.trace.jsonl"
export EDDIE_CLI_TOOLS="bash,file_read"
eddie ask "Summarise production alerts"
```

Flags typed on the command line still win, so `eddie run "Deploy" --provider anthropic` temporarily overrides the environment values set above.【F:packages/config/src/runtime-cli.ts†L1-L120】

## Configuration discovery and merging

- The CLI searches for `eddie.config.json`, `eddie.config.yaml`, `eddie.config.yml`, `.eddierc`, `.eddierc.json`, or `.eddierc.yaml` inside the working directory and the `config/` directory (or a custom `CONFIG_ROOT`).【F:packages/config/src/config-path.ts†L5-L57】
- `CONFIG_ROOT` lets you relocate configuration alongside infrastructure-as-code repositories while still running the CLI from project roots.【F:packages/config/src/config-path.ts†L16-L28】
- Pass `--config relative/or/absolute/path.yaml` when you need to pin a specific file; the CLI validates the path and fails fast if it does not exist.【F:packages/config/src/config-path.ts†L31-L58】
- Once a file is loaded, `ConfigService` layers defaults, file contents, and runtime overrides so feature-specific defaults (such as provider profiles) remain intact until you explicitly change them.【F:packages/config/src/config.service.ts†L123-L133】【F:packages/config/src/config.service.ts†L145-L156】

## Error handling and troubleshooting

- Missing prompts for `ask` or `run` raise clear errors before contacting a model, so scripts can exit early with actionable feedback.【F:apps/cli/src/cli/commands/ask.command.ts†L19-L27】【F:apps/cli/src/cli/commands/run.command.ts†L19-L27】
- The `trace` command captures filesystem issues and prints `Unable to read trace at …` instead of throwing, a hint to check permissions or run history.【F:apps/cli/src/cli/commands/trace.command.ts†L24-L45】
- When `context` globs do not match any files the command prints `No context files matched the current configuration.` to help you adjust include patterns.【F:apps/cli/src/cli/commands/context.command.ts†L41-L44】
- All commands exit with code `1` on unhandled errors so CI pipelines can fail fast; check logs with `--log-level debug` when diagnosing provider authentication or tool failures.【F:apps/cli/src/main.ts†L20-L35】【F:packages/config/src/runtime-env.ts†L63-L141】

## Performance tuning and token budgets

- Context packing enforces `maxFiles` and `maxBytes` limits (defaults: 64 files, 250,000 bytes) to keep prompts within provider token budgets and prevent runaway uploads.【F:packages/context/src/context.service.ts†L23-L24】【F:packages/context/src/context.service.ts†L729-L741】
- Raise or lower these caps in `eddie.config.*` as projects grow; the CLI will refuse to add files beyond the configured budget and logs when limits are hit.【F:packages/context/src/context.service.ts†L704-L713】【F:packages/context/src/context.service.ts†L720-L739】
- Use `eddie context` regularly to inspect the file list, byte totals, and estimated tokens before a large automation run; the command leverages the tokenizer provider to display the projected token budget upfront.【F:apps/cli/src/cli/commands/context.command.ts†L25-L55】
- Pair conservative budgets with `--tools file_read,file_write` to keep low-latency iterations responsive, and fall back to wider budgets only when necessary for long-form tasks.【F:apps/cli/src/cli/commands/context.command.ts†L25-L59】【F:packages/context/src/context.service.ts†L729-L741】
