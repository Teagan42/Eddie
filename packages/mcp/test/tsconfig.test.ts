import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const toProjectPath = (relative: string) =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), relative);

type Tsconfig = {
  compilerOptions?: {
    moduleResolution?: string;
    module?: string;
  };
};

const loadTsconfig = () => {
  const tsconfigPath = toProjectPath("../tsconfig.json");
  const raw = readFileSync(tsconfigPath, "utf8");
  return JSON.parse(raw) as Tsconfig;
};

describe("tsconfig compatibility", () => {
  const config = loadTsconfig();

  it("uses Node16 module resolution to resolve the MCP SDK", () => {
    expect(config.compilerOptions?.moduleResolution).toBe("Node16");
  });

  it("targets Node16 modules to align with module resolution", () => {
    expect(config.compilerOptions?.module).toBe("Node16");
  });
});
