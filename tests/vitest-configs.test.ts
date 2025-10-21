import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  ".."
);

const loadConfig = async (relativePath: string) => {
  const configUrl = new URL(`../${relativePath}/vitest.config.ts`, import.meta.url);
  const module = await import(configUrl.href);
  return module.default ?? module;
};

const loadRootConfig = async () => {
  const configUrl = new URL("../vitest.config.ts", import.meta.url);
  const module = await import(configUrl.href);
  return module.default ?? module;
};

const enumerateWorkspaces = (group: "apps" | "packages") =>
  fs
    .readdirSync(path.resolve(repoRoot, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${group}/${entry.name}`);

describe("workspace vitest configuration", () => {
  it("ensures each app config opts into threaded pooling", async () => {
    const appWorkspaces = enumerateWorkspaces("apps");

    expect(appWorkspaces.length).toBeGreaterThan(0);

    await Promise.all(
      appWorkspaces.map(async (workspace) => {
        const config = await loadConfig(workspace);

        expect(config.test?.pool).toBe("threads");
      })
    );
  });

  it("ensures each package config opts into threaded pooling", async () => {
    const packageWorkspaces = enumerateWorkspaces("packages");

    expect(packageWorkspaces.length).toBeGreaterThan(0);

    await Promise.all(
      packageWorkspaces.map(async (workspace) => {
        const config = await loadConfig(workspace);

        expect(config.test?.pool).toBe("threads");
      })
    );
  });

  it("registers all vitest projects through the root config", async () => {
    const config = await loadRootConfig();

    expect(Array.isArray(config.test?.projects)).toBe(true);

    const extendsPaths = config.test?.projects
      ?.map((project) => project?.extends)
      .filter((value): value is string => typeof value === "string");

    expect(extendsPaths).toEqual([
      "./apps/api/vitest.config.ts",
      "./apps/web/vitest.config.ts",
      "./apps/cli/vitest.config.ts",
      "./platform/ui/vitest.config.ts",
      "./platform/testing/ci-support/vitest.config.ts",
      "./platform/testing/perf-benchmarks/vitest.config.ts",
      "./platform/integrations/api-client/vitest.config.ts",
      "./platform/runtime/engine/vitest.config.ts",
      "./platform/runtime/hooks/vitest.config.ts",
      "./platform/runtime/context/vitest.config.ts",
      "./platform/runtime/io/vitest.config.ts",
      "./platform/runtime/tools/vitest.config.ts",
      "./platform/core/config/vitest.config.ts",
      "./platform/core/templates/vitest.config.ts",
      "./platform/core/tokenizers/vitest.config.ts",
      "./platform/core/types/vitest.config.ts",
      "./platform/integrations/providers/vitest.config.ts",
      "./platform/integrations/mcp/vitest.config.ts",
    ]);
  });
});

