import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "..", "..");

const readJson = <T>(relativePath: string) =>
  JSON.parse(readFileSync(join(repoRoot, relativePath), "utf-8")) as T;

describe("perf benchmark workspace integration", () => {
  it("adds perf-benchmarks workspace and bench script to root package", () => {
    const manifest = readJson<{
      scripts?: Record<string, string>;
      workspaces?: string[];
    }>("package.json");

    expect(manifest.workspaces).toContain("packages/perf-benchmarks");
    expect(manifest.scripts?.bench).toBe(
      "npm run bench --workspace @eddie/perf-benchmarks --if-present"
    );
  });

  it("registers perf-benchmarks path aliases for TypeScript", () => {
    const tsconfigBase = readJson<{
      compilerOptions?: { paths?: Record<string, string[]> };
    }>("tsconfig.base.json");

    expect(tsconfigBase.compilerOptions?.paths).toMatchObject({
      "@eddie/perf-benchmarks": ["packages/perf-benchmarks/src"],
      "@eddie/perf-benchmarks/*": ["packages/perf-benchmarks/src/*"],
    });
  });

  it("references the perf-benchmarks project for composite builds", () => {
    const tsconfig = readJson<{
      references?: { path: string }[];
    }>("tsconfig.json");

    expect(tsconfig.references).toContainEqual({
      path: "./packages/perf-benchmarks",
    });
  });

  it("declares perf-benchmarks in nest-cli workspace projects", () => {
    const nestCli = readJson<{
      projects?: Record<string, { root: string; sourceRoot?: string }>;
    }>("nest-cli.json");

    expect(nestCli.projects).toHaveProperty("perf-benchmarks");
    expect(nestCli.projects?.["perf-benchmarks"]).toMatchObject({
      root: "packages/perf-benchmarks",
    });
  });
});
