import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const docsPath = join(__dirname, "..", "..", "docs", "performance-benchmarks.md");

describe("performance benchmarks documentation", () => {
  it("exists and explains how to run npm run bench", () => {
    const contents = readFileSync(docsPath, "utf-8");

    expect(contents).toMatch(/# Performance Benchmarks/);
    expect(contents).toMatch(/npm run bench/);
    expect(contents).toMatch(/benchmark-results\.json/);
  });
});
