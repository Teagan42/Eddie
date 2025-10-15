# Configuration Migration Workflow

Eddie persists workspace configuration as structured data in `eddie.config.*`
files. Every persisted config now carries an explicit `version` number so that
new releases can recognise and upgrade older layouts without breaking running
projects.

## Current version

The latest supported configuration version is **1**. A freshly generated config
looks like this:

```yaml
version: 1
model: gpt-4o-mini
provider:
  name: openai
# …
```

When the CLI reads a config that omits `version` (legacy files) it treats that
as version `0`.

## Automatic migrations

`ConfigService` runs migrations before normalising any configuration. The
runner lives in [`packages/config/src/migrations/`](../../packages/config/src/migrations/)
and executes each step sequentially until the `LATEST_CONFIG_VERSION` is
reached. Each migration returns the updated input and any human-readable
warnings. For example, the `0 → 1` migration simply stamps the version and emits
this warning:

```
Config version 0 was automatically migrated to version 1.
```

Warnings are forwarded to `console.warn` so the CLI and API log streams make it
obvious that an upgrade occurred.

## Adding a new migration

1. Create a file such as `migrate-1-to-2.ts` inside the migrations directory.
   Export a function that accepts an `EddieConfigInput` and returns the updated
   input alongside an array of warnings.
2. Register the migration in `CONFIG_MIGRATIONS` with the matching `from` and
   `to` versions.
3. Bump `LATEST_CONFIG_VERSION` and update `DEFAULT_CONFIG` to use the new
   value.
4. Add Vitest coverage that exercises the new migration and verifies both the
   upgrade logic and any emitted warnings.
5. Update this document with guidance for the new version.

## Unsupported versions

If a config advertises a version newer than the CLI understands, or if there is
no registered migration path, `ConfigService.compose` throws an error such as:

```
Config version 3 is newer than supported. Please update Eddie.
```

or

```
Config version -1 cannot be automatically migrated to version 1.
```

Upgrade Eddie (or apply the migration manually) before retrying. This keeps
unknown configuration layouts from silently producing incorrect runtime
behaviour.
