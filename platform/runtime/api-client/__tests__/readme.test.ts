import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, "..", "README.md");

const requiredHeadings = [
  "## Purpose",
  "## Installation",
  "## API Reference",
  "## Usage Examples",
  "## Testing",
];

describe("@eddie/api-client README", () => {
  it("describes how to use the generated client", () => {
    const content = readFileSync(readmePath, "utf8");

    expect(content.startsWith("# @eddie/api-client")).toBe(true);

    const missing = requiredHeadings.filter((heading) => !content.includes(heading));
    expect(missing).toEqual([]);
  });
});
