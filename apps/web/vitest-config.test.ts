import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

describe("vitest.config", () => {
  it("uses forked test pool for deterministic concurrency", async () => {
    const workspaceRoot = dirname(fileURLToPath(import.meta.url));
    const configPath = resolve(workspaceRoot, "vitest.config.ts");
    const contents = await readFile(configPath, "utf8");

    expect(contents).toContain('pool: "forks"');
  });
});
