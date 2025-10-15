import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, "..", "README.md");

const requiredSections = [
  "## Purpose",
  "## Installation",
  "## API Reference",
  "## Usage Examples",
  "## Testing",
] as const;

describe("@eddie/tokenizers README", () => {
  it("documents provider-aware token counting", () => {
    const content = readFileSync(readmePath, "utf8");
    const [firstLine = ""] = content.split(/\r?\n/u);

    expect(firstLine).toBe("# @eddie/tokenizers");

    const missing = requiredSections.filter((section) => !content.includes(section));
    expect(missing).toEqual([]);
  });
});
