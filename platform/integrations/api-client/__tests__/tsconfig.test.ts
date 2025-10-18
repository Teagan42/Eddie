import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const loadConfig = (relativePath: string): unknown => {
  const url = new URL(relativePath, import.meta.url);
  const content = readFileSync(url, "utf8");
  return JSON.parse(content);
};

const CONFIG_PATHS = ["../tsconfig.json", "../tsconfig.build.json"] as const;

describe("TypeScript project references", () => {
  it("include @eddie/types in workspace configs", () => {
    for (const path of CONFIG_PATHS) {
      const config = loadConfig(path) as {
        references?: Array<{ path?: string }>;
      };
      const references = config.references ?? [];
      const hasTypesReference = references.some(
        (reference) => reference.path === "../../core/types"
      );
      expect(hasTypesReference).toBe(true);
    }
  });
});
