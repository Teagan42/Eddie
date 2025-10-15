import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import config from "../vitest.config";

const loadJsonReporter = () => {
  const reporters = config.test?.benchmark?.reporters ?? [];
  return reporters.find(
    (reporter) => Array.isArray(reporter) && reporter[0] === "json"
  ) as [string, { outputFile?: string }] | undefined;
};

describe("perf benchmark vitest config", () => {
  it("enables a JSON benchmark reporter for CI", () => {
    expect(config.test?.benchmark?.reporters ?? []).toContainEqual([
      "json",
      expect.objectContaining({
        outputFile: expect.stringContaining("benchmark-results.json"),
      }),
    ]);
  });

  it("resolves workspace path aliases", () => {
    const alias = config.resolve?.alias ?? {};

    expect(alias).toHaveProperty(
      "@eddie/config",
      expect.stringContaining("packages/config/src")
    );
  });

  it("ensures the benchmark reports directory exists", () => {
    const jsonReporter = loadJsonReporter();
    const outputFile = jsonReporter?.[1]?.outputFile;
    expect(typeof outputFile).toBe("string");
    if (!outputFile) {
      return;
    }

    const reportsDir = path.dirname(outputFile);
    expect(fs.existsSync(reportsDir)).toBe(true);
  });
});
