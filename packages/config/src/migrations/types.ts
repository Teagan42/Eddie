import type { EddieConfigInput } from "../types";

export interface ConfigMigrationResult {
  input: EddieConfigInput;
  warnings: string[];
}

export interface ConfigMigration {
  from: number;
  to: number;
  migrate(input: EddieConfigInput): ConfigMigrationResult;
}
