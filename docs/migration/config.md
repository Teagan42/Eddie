# Eddie configuration migrations

Eddie configuration files now carry a `version` number so that breaking
structure changes can be applied safely over time. The config service stamps the
normalized snapshot with the latest version, validates it, and persists the
value so future loads know which migrations to run.

## Version numbers

- The current version is exported from `platform/core/config/src/migrations` as
  `CURRENT_CONFIG_VERSION`.
- Persisted config files should include a `version` field. When the field is
  omitted the migration runner treats the file as version `0`.
- The normalized config always contains the current version. The validator
  fails if the version is missing or does not match `CURRENT_CONFIG_VERSION`.

## Migration runner

`platform/core/config/src/migrations/index.ts` defines the migration framework:

```ts
export interface ConfigMigration {
  id: string;
  from: number;
  to: number;
  migrate(config: EddieConfigInput): ConfigMigrationResult;
}
```

Each migration transforms the previous schema into the next one. The runner
applies migrations sequentially until it reaches `CURRENT_CONFIG_VERSION`. If it
cannot find a migration for a step it throws. Any warnings returned from a
migration are logged by `ConfigService.compose` before validation.

The initial migration upgrades legacy configs (with no version) to `1`:

```ts
const CONFIG_MIGRATIONS: ConfigMigration[] = [
  {
    id: "0001-add-config-version",
    from: 0,
    to: 1,
    migrate(config) {
      return {
        config: {
          ...config,
          version: CURRENT_CONFIG_VERSION,
        },
      };
    },
  },
];
```

## Adding a new migration

1. Bump `CURRENT_CONFIG_VERSION` in `platform/core/config/src/migrations/index.ts`.
2. Append a new migration object that describes how to transform configs from
   the previous version to the new one. Use the pattern above to return the
   migrated config and any warnings.
3. Update `DEFAULT_CONFIG` (and any presets) to use the new schema.
4. Extend validation, schemas, and documentation as needed.
5. Add tests covering the migration runner and any changes to
   `ConfigService.compose` behaviour.

When migrations require manual intervention, add a warning message to the
migration result. The config service emits the warning so users know what to do
before re-running Eddie.

## Example workflow

```bash
# run targeted package tests while iterating
npm run test --workspace @eddie/config -- config.migrations.test.ts

# after implementation, run the package suite
npm run test --workspace @eddie/config
```

Treat migrations as part of the public contract—document them in release notes
and keep the examples up to date so teams can upgrade their configs confidently.
