import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const legacyLintCompliancePath = join(testDir, "lint-compliance.test.ts");

describe("lint compliance regression", () => {
  it("removes the legacy lint compliance suite", () => {
    expect(existsSync(legacyLintCompliancePath)).toBe(false);
  });
});
