import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const docPath = join(repoRoot, "docs", "migration", "api-realtime-baseline.md");

const requiredSections = [
  /Chat Sessions Gateway/i,
  /Traces Gateway/i,
  /Runtime Config Gateway/i,
  /Tools Gateway/i,
  /Inbound Triggers/i,
  /Listeners/i,
  /Transports/i,
];

describe("api realtime baseline design note", () => {
  it("is present in the migration docs folder", () => {
    expect(existsSync(docPath)).toBe(true);
  });

  it("documents gateway triggers, listeners, and transports", () => {
    const content = readFileSync(docPath, "utf8");

    for (const pattern of requiredSections) {
      expect(content).toMatch(pattern);
    }
  });
});
