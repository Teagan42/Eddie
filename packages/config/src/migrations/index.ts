import type { EddieConfigInput } from "../types";
import { migrateConfigFrom0To1 } from "./migrate-0-to-1";
import type { ConfigMigration, ConfigMigrationResult } from "./types";

export const LATEST_CONFIG_VERSION = 1;

const CONFIG_MIGRATIONS: ReadonlyArray<ConfigMigration> = [
  {
    from: 0,
    to: 1,
    migrate: migrateConfigFrom0To1,
  },
];

export function runConfigMigrations(
  input: EddieConfigInput,
): ConfigMigrationResult {
  const startingVersion = resolveConfigVersion(input);

  if (startingVersion > LATEST_CONFIG_VERSION) {
    throw new Error(
      `Config version ${startingVersion} is newer than supported. Please update Eddie.`,
    );
  }

  const warnings: string[] = [];
  let currentVersion = startingVersion;
  let currentInput = { ...input } as EddieConfigInput;

  while (currentVersion < LATEST_CONFIG_VERSION) {
    const migration = CONFIG_MIGRATIONS.find(
      (candidate) => candidate.from === currentVersion,
    );

    if (!migration) {
      throw createUnsupportedMigrationError(currentVersion);
    }

    const result = migration.migrate(currentInput);
    currentInput = result.input;
    currentVersion = migration.to;

    if (result.warnings.length) {
      warnings.push(...result.warnings);
    }
  }

  return {
    input: {
      ...currentInput,
      version: LATEST_CONFIG_VERSION,
    },
    warnings,
  };
}

function createUnsupportedMigrationError(version: number): Error {
  return new Error(
    `Config version ${version} cannot be automatically migrated to version ${LATEST_CONFIG_VERSION}.`,
  );
}

function resolveConfigVersion(input: EddieConfigInput): number {
  return typeof input.version === "number" ? input.version : 0;
}
