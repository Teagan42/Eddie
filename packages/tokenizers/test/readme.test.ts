import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, "..", "README.md");
const readmeContent = readFileSync(readmePath, "utf8");

const requiredSections = [
  "## Purpose",
  "## Installation",
  "## API Reference",
  "## Usage Examples",
  "## Testing",
] as const;

describe("@eddie/tokenizers README", () => {
  it("documents provider-aware token counting", () => {
    const [firstLine = ""] = readmeContent.split(/\r?\n/u);

    expect(firstLine).toBe("# @eddie/tokenizers");

    const missing = requiredSections.filter(
      (section) => !readmeContent.includes(section)
    );
    expect(missing).toEqual([]);
  });

  it("details the tokenizer strategies injection token", () => {
    expect(readmeContent).toMatch(
      /`TOKENIZER_STRATEGIES` – dependency injection token supplying the `TokenizerStrategyRegistry`\s+consumed by `TokenizerService` when selecting provider implementations\./u
    );
  });
});
