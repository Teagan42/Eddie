import type { EddieConfigInput } from "../types";
import type { ConfigMigrationResult } from "./types";

export function migrateConfigFrom0To1(
  input: EddieConfigInput,
): ConfigMigrationResult {
  return {
    input: {
      ...input,
      version: 1,
    },
    warnings: ["Config version 0 was automatically migrated to version 1."],
  };
}
