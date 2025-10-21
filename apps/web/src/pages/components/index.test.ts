import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("components barrel", () => {
  it("re-exports overview auth panel from shared ui package", () => {
    const source = readFileSync(resolve(__dirname, "./index.ts"), "utf8");
    const exportPattern = /export\s*\{[^}]*OverviewAuthPanel[^}]*\}\s*from\s+"@eddie\/ui\/overview";/;

    expect(exportPattern.test(source)).toBe(true);
  });
});
