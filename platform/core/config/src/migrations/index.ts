import type { EddieConfigInput } from "../types";

export type ConfigVersion = number;

export interface ConfigMigrationResult {
  config: EddieConfigInput;
  warnings?: string[];
}

export interface ConfigMigration {
  id: string;
  from: ConfigVersion;
  to: ConfigVersion;
  migrate(config: EddieConfigInput): ConfigMigrationResult;
}

export const CURRENT_CONFIG_VERSION: ConfigVersion = 1;

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

const CONFIG_MIGRATIONS_BY_SOURCE = new Map<ConfigVersion, ConfigMigration>(
  CONFIG_MIGRATIONS.map((migration) => [migration.from, migration]),
);

export interface ConfigMigrationOutcome {
  migrated: EddieConfigInput;
  initialVersion: ConfigVersion;
  finalVersion: ConfigVersion;
  appliedMigrations: string[];
  warnings: string[];
}

export function runConfigMigrations(
  input: EddieConfigInput,
): ConfigMigrationOutcome {
  const initialVersion =
    typeof input.version === "number" ? input.version : 0;

  let currentVersion = initialVersion;
  let workingConfig = input;
  const appliedMigrations: string[] = [];
  const warnings: string[] = [];

  while (currentVersion < CURRENT_CONFIG_VERSION) {
    const migration = CONFIG_MIGRATIONS_BY_SOURCE.get(currentVersion);

    if (!migration) {
      throw new Error(
        `No migration available from config version ${currentVersion}.`,
      );
    }

    const { config: migratedConfig, warnings: migrationWarnings } =
      migration.migrate(workingConfig);

    workingConfig = migratedConfig;
    currentVersion = migration.to;
    appliedMigrations.push(migration.id);

    if (Array.isArray(migrationWarnings) && migrationWarnings.length > 0) {
      warnings.push(...migrationWarnings);
    }
  }

  if (workingConfig !== input && workingConfig.version !== CURRENT_CONFIG_VERSION) {
    workingConfig = {
      ...workingConfig,
      version: CURRENT_CONFIG_VERSION,
    };
  }

  return {
    migrated: workingConfig,
    initialVersion,
    finalVersion: currentVersion,
    appliedMigrations,
    warnings,
  };
}
