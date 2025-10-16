import { describe, expect, it } from "vitest";

import type { EddieConfigInput } from "../src/types";
import {
  CURRENT_CONFIG_VERSION,
  runConfigMigrations,
} from "../src/migrations";

describe("runConfigMigrations", () => {
  it("upgrades configs without a version to the current version", () => {
    const input: EddieConfigInput = {};

    const outcome = runConfigMigrations(input);

    expect(outcome.initialVersion).toBe(0);
    expect(outcome.finalVersion).toBe(CURRENT_CONFIG_VERSION);
    expect(outcome.migrated.version).toBe(CURRENT_CONFIG_VERSION);
    expect(outcome.appliedMigrations).not.toHaveLength(0);
    expect(outcome.warnings).toEqual([]);
  });

  it("skips migrations when the config is already current", () => {
    const input: EddieConfigInput = { version: CURRENT_CONFIG_VERSION };

    const outcome = runConfigMigrations(input);

    expect(outcome.initialVersion).toBe(CURRENT_CONFIG_VERSION);
    expect(outcome.finalVersion).toBe(CURRENT_CONFIG_VERSION);
    expect(outcome.migrated).toBe(input);
    expect(outcome.appliedMigrations).toEqual([]);
    expect(outcome.warnings).toEqual([]);
  });
});
