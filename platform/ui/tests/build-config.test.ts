import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readConfig<T>(relativePath: string): T {
  const rootDir = join(__dirname, "..");
  return JSON.parse(readFileSync(join(rootDir, relativePath), "utf-8")) as T;
}

describe("@eddie/ui build configuration", () => {
  it("references esm and cjs build projects", () => {
    const config = readConfig<{ references?: Array<{ path: string }> }>(
      "tsconfig.build.json",
    );

    expect(config.references).toBeDefined();
    expect(config.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "./tsconfig.build.esm.json" }),
        expect.objectContaining({ path: "./tsconfig.build.cjs.json" }),
      ]),
    );
  });

  it("emits esm bundles alongside shared type declarations", () => {
    const config = readConfig<{ compilerOptions?: Record<string, unknown> }>(
      "tsconfig.build.esm.json",
    );

    expect(config.compilerOptions).toMatchObject({
      module: "NodeNext",
      moduleResolution: "NodeNext",
      declaration: true,
      declarationDir: "dist/types",
    });
  });

  it("emits cjs bundles sharing the same declaration output", () => {
    const config = readConfig<{ compilerOptions?: Record<string, unknown> }>(
      "tsconfig.build.cjs.json",
    );

    expect(config.compilerOptions).toMatchObject({
      module: "CommonJS",
      moduleResolution: "Node",
      declaration: true,
      declarationDir: "dist/types",
    });
  });
});
