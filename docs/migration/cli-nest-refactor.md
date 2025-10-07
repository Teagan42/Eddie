# Migrating to the Nest-backed Eddie CLI

The 2025 Nest refactor replaces the Commander bootstrapper with a Nest application context. Commands now resolve their dependencies through `AppModule`, guaranteeing consistent configuration, logging, and lifecycle hooks. This guide highlights the breaking changes you should account for when upgrading an existing automation or CI pipeline.

## Build and Execution Changes

- **Compile with Nest.** Use `npm run build` (which runs `nest build`) before invoking the CLI in production or CI. The generated `dist/main.js` is also the published `eddie` binary.
- **Runtime entrypoint.** When executing locally without installing globally, run `node dist/main.js <command>` or `npm exec -- eddie <command>`. The file keeps its shebang, so `./dist/main.js` works on Unix systems after `chmod +x`.
- **Development workflow.** `npm run dev` proxies to `nest start --watch`, giving you hot module replacement while preserving the CLI argument contract. The command accepts the same arguments you would pass to the compiled binary.

## Configuration Resolution

- **Config search paths are unchanged**: Eddie still scans for `eddie.config.json`, `eddie.config.yaml`, `eddie.config.yml`, `.eddierc`, `.eddierc.json`, and `.eddierc.yaml` in the working directory. Explicit `--config` flags continue to override this search.
- **Context defaults** now come directly from the Nest-managed `ConfigService`. When no include globs are supplied, the CLI falls back to the defaults defined in `src/config/defaults.ts` and reports them through the shared logger.
- **Logging output** continues to write to `.eddie/logs/eddie.log` when a file destination is configured. The Nest `LoggerService` memoises configuration, so make sure long-running processes call `logger.reset()` if they manage multiple CLI contexts.

## Environment Variables

The provider adapters are unchanged, but the Nest bootstrap makes the following variables more visible because the dependency container no longer hides provider construction:

- `OPENAI_API_KEY` – default key when no provider-specific key is configured.
- `ANTHROPIC_API_KEY` – default key for Anthropic requests.
- Any other provider-specific keys can still be supplied via `eddie.config.*` or CLI flags.

These variables are read at runtime when the provider is instantiated, so keep them available in any shells or CI jobs that call the CLI.

## Behavioural Parity

- Command names, aliases, and argument parsing are preserved. The new `CliRunnerService` delegates to the same command classes, now instantiated by Nest, and integration tests assert parity with the legacy CLI.
- Hooks, tool execution, and trace writing still surface through the same modules; the only change is that their lifetimes are managed by Nest's dependency injection container.

By following the steps above you should experience feature parity with the older CLI while benefiting from deterministic module wiring and easier testing.
