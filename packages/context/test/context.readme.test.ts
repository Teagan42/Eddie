import { readFile } from "fs/promises";
import path from "path";

const README_PATH = path.resolve(__dirname, "../README.md");
const DEFAULT_MAX_BYTES_LABEL = "250,000 bytes";
const DEFAULT_MAX_FILES_LABEL = "64 files";

describe("packages/context README", () => {
  it("documents default context limits and usage example", async () => {
    const content = await readFile(README_PATH, "utf8");

    expect(content).toContain("ContextService");
    expect(content).toContain(DEFAULT_MAX_BYTES_LABEL);
    expect(content).toContain(DEFAULT_MAX_FILES_LABEL);
    expect(content).toMatch(/```ts[\s\S]*ContextService/);
  });
});
