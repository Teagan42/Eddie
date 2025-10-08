# Eddie CLI option reference

Eddie's CLI collects flags in `CliParserService` and adapts them into engine runtime options, so every command (`ask`, `run`, `chat`, `context`, `trace`, etc.) accepts the same option surface area. The parser recognises aliases, boolean toggles, and repeated string arguments before `CliOptionsService` coalesces them into the configuration layer passed to the engine.【F:src/cli/cli-parser.service.ts†L8-L93】【F:src/cli/cli-options.service.ts†L5-L69】

## Parsing behaviour at a glance

- Non-boolean options accept values either by repeating the flag (`--context src --context test`) or by providing a comma-separated list (`--context src,test`), and the service normalises them into arrays before configuration merging.【F:src/cli/cli-parser.service.ts†L77-L90】【F:src/cli/cli-options.service.ts†L5-L68】
- Boolean toggles (for example `--auto-approve`) do not accept an explicit value; their presence sets the corresponding option to `true` during parsing.【F:src/cli/cli-parser.service.ts†L27-L66】
- Supplying `--no-context` short-circuits the context loader by clearing include patterns and budgets so no files are packed for the request.【F:src/cli/cli-options.service.ts†L44-L45】【F:src/config/config.service.ts†L236-L244】
- Setting logging, tracing, tool, or agent flags updates the merged runtime config, overriding any defaults loaded from configuration files or the built-in baseline.【F:src/config/config.service.ts†L251-L316】【F:src/config/defaults.ts†L10-L57】

## Flag reference

| Flag | Aliases | Type | Description | Default |
| --- | --- | --- | --- | --- |
| `--context` | `-C` | string[] | Overrides the glob patterns packed into the request context. Accepts repeated flags or comma-separated lists. Ignored when `--no-context` is present.【F:src/cli/cli-parser.service.ts†L8-L90】【F:src/config/config.service.ts†L236-L248】 | `src/**/*` from the default config.【F:src/config/defaults.ts†L15-L18】 |
| `--no-context` | – | boolean | Disables context collection entirely by clearing include patterns and budgets.【F:src/cli/cli-options.service.ts†L44-L45】【F:src/config/config.service.ts†L236-L244】 | Context enabled with defaults unless flag supplied.【F:src/config/defaults.ts†L15-L18】 |
| `--config` | `-c` | string | Points to a specific `eddie.config.(json|yaml)` file to load before applying overrides.【F:src/cli/cli-parser.service.ts†L11-L74】【F:src/cli/cli-options.service.ts†L26】 | Automatic discovery in project root if flag omitted (see `README`). |
| `--model` | `-m` | string | Overrides the model identifier used for the run.【F:src/cli/cli-parser.service.ts†L13-L74】【F:src/cli/cli-options.service.ts†L27】 | `gpt-4o-mini`.【F:src/config/defaults.ts†L10-L18】 |
| `--provider` | `-p` | string | Selects a provider profile by name; if the profile exists it also hydrates the associated model. Otherwise sets the provider name directly.【F:src/cli/cli-parser.service.ts†L15-L74】【F:src/config/config.service.ts†L220-L234】 | `openai`.【F:src/config/defaults.ts†L12-L14】 |
| `--tools` | `-t` | string[] | Restricts the enabled tool list to the provided identifiers.【F:src/cli/cli-parser.service.ts†L17-L90】【F:src/config/config.service.ts†L251-L255】 | `bash`, `file_read`, `file_write`.【F:src/config/defaults.ts†L35-L38】 |
| `--disable-tools` | `-D` | string[] | Marks the provided tools as disabled for the run while leaving the rest of the registry untouched.【F:src/cli/cli-parser.service.ts†L19-L90】【F:src/config/config.service.ts†L258-L262】 | No tools disabled by default.【F:src/config/defaults.ts†L35-L38】 |
| `--auto-approve` | – | boolean | Enables automatic approval of tool calls. Alias: `--auto`.【F:src/cli/cli-parser.service.ts†L27-L90】【F:src/cli/cli-options.service.ts†L48-L53】【F:src/config/config.service.ts†L265-L269】 | Manual confirmation required (`false`).【F:src/config/defaults.ts†L35-L38】 |
| `--auto` | – | boolean | Alias for `--auto-approve`; see above.【F:src/cli/cli-parser.service.ts†L27-L90】【F:src/cli/cli-options.service.ts†L48-L53】 | Same as `--auto-approve`. |
| `--non-interactive` | – | boolean | Runs commands without prompting for confirmations (useful for CI). When paired with `--auto-approve`, runs proceed without pauses.【F:src/cli/cli-parser.service.ts†L27-L90】【F:src/cli/cli-options.service.ts†L55-L67】 | Interactive prompts enabled by default.【F:src/config/defaults.ts†L35-L38】 |
| `--jsonl-trace` | – | string | Overrides the JSONL trace path for structured run logs.【F:src/cli/cli-parser.service.ts†L21-L74】【F:src/config/config.service.ts†L272-L276】 | `.eddie/trace.jsonl`.【F:src/config/defaults.ts†L30-L33】 |
| `--log-level` | – | string | Sets the logging level for the run and propagates it to the logger configuration.【F:src/cli/cli-parser.service.ts†L22-L74】【F:src/config/config.service.ts†L279-L287】 | `info`.【F:src/config/defaults.ts†L20-L29】 |
| `--log-file` | – | string | Writes structured logs to the specified file instead of standard output. Pretty-printing and colour are disabled when writing to files.【F:src/cli/cli-parser.service.ts†L23-L74】【F:src/config/config.service.ts†L289-L301】 | Logs stream to pretty stdout transport by default.【F:src/config/defaults.ts†L20-L29】 |
| `--agent-mode` | – | string | Switches the agent orchestration strategy (for example `single`, `manager`, or custom modes defined in config).【F:src/cli/cli-parser.service.ts†L24-L74】【F:src/config/config.service.ts†L303-L310】 | `single`.【F:src/config/defaults.ts†L46-L56】 |
| `--disable-subagents` | – | boolean | Prevents manager agents from spawning additional subagents during the run.【F:src/cli/cli-parser.service.ts†L27-L90】【F:src/config/config.service.ts†L308-L314】 | Subagents enabled (`true`).【F:src/config/defaults.ts†L46-L56】 |

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

These combinations layer on top of `eddie.config.*` and the defaults shown above, so they can be mixed-and-matched for repeatable execution environments.【F:src/config/config.service.ts†L236-L316】【F:src/config/defaults.ts†L10-L56】
