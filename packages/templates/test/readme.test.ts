import { describe, expect, it } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("README documentation", () => {
  it("mentions template cache freshness based on file changes", async () => {
    const readmePath = path.resolve(__dirname, "..", "README.md");
    const contents = await fs.readFile(readmePath, "utf-8");
    const normalizedContents = contents.replace(/\r\n/g, "\n").toLowerCase();
    const expectedPhrase =
      "cache entry tracks the source file's last modification time (mtime)";

    expect(normalizedContents).toContain(expectedPhrase);
  });
});
