import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const contextDocPath = join(repoRoot, "docs", "templates.md");
const docContent = readFileSync(contextDocPath, "utf8");

describe("context documentation", () => {
  it("mentions default context budgets and overrides", () => {
    expect(docContent).toMatch(/64\s+files/i);
    expect(docContent).toMatch(/250[, ]?000\s+bytes/i);
    expect(docContent).toMatch(/maxFiles/i);
    expect(docContent).toMatch(/maxBytes/i);
  });

  it("includes an inline example of packed context output", () => {
    expect(docContent).toMatch(/\/\/ File:/);
    expect(docContent).toMatch(/\/\/ Resource:/);
  });
});
