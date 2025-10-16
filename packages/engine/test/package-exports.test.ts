import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageExportMap = Record<string, { types?: string; default?: string }>;

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as {
  exports?: PackageExportMap;
};

describe("package exports", () => {
  it("exposes templating subpath entry", () => {
    expect(packageJson.exports).toBeDefined();

    const templatingExport = packageJson.exports?.["./templating"];

    expect(templatingExport).toEqual({
      types: "./dist/templating/index.d.ts",
      default: "./dist/templating/index.js",
    });
  });
});
