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
});

