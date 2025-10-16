import { describe, expect, it } from "vitest";

import {
  getWorkspaceByName,
  loadWorkspaceMatrix,
  loadWorkspaces,
  selectWorkspaceNamesForPaths,
} from "../index";

const EXPECTED_NAMES = [
  "@eddie/api",
  "@eddie/web",
  "@eddie/cli",
  "@eddie/config",
  "@eddie/context",
  "@eddie/engine",
  "@eddie/hooks",
  "@eddie/io",
  "@eddie/mcp",
  "@eddie/providers",
  "@eddie/templates",
  "@eddie/tokenizers",
  "@eddie/tools",
  "@eddie/types",
  "@eddie/api-client",
];

describe("loadWorkspaces", () => {
  it("returns every workspace with full metadata", () => {
    const workspaces = loadWorkspaces();

    expect(workspaces).toHaveLength(EXPECTED_NAMES.length);
    expect(workspaces.map((workspace) => workspace.name)).toEqual(EXPECTED_NAMES);
    for (const workspace of workspaces) {
      expect(workspace).toEqual(
        expect.objectContaining({
          name: expect.stringContaining("@eddie/"),
          path: expect.stringContaining("/"),
          coverage: expect.stringContaining("/"),
          coverageArtifact: expect.stringContaining("coverage-"),
          dist: expect.stringContaining("/"),
          tsbuildinfo: expect.stringContaining(".tsbuildinfo"),
          tsconfig: expect.stringContaining("tsconfig"),
        })
      );
    }
  });
});

describe("getWorkspaceByName", () => {
  it("returns the workspace metadata for a known package", () => {
    const workspace = getWorkspaceByName("@eddie/web");

    expect(workspace.path).toBe("apps/web");
    expect(workspace.prebuild).toEqual([
      "npm run build --workspace @eddie/api-client",
    ]);
  });

  it("throws when the workspace cannot be found", () => {
    expect(() => getWorkspaceByName("@eddie/missing" as "@eddie/api")).toThrow(
      /Unknown workspace/i
    );
  });
});

describe("loadWorkspaceMatrix", () => {
  it("builds the lint matrix with the expected node versions", () => {
    const matrix = loadWorkspaceMatrix("lint");

    expect(matrix["node-version"]).toEqual(["20.x"]);
    expect(matrix.workspace).toHaveLength(EXPECTED_NAMES.length);
  });

  it("builds the test matrix with both supported node versions", () => {
    const matrix = loadWorkspaceMatrix("test");

    expect(matrix["node-version"]).toEqual(["20.x", "22.x"]);
    expect(matrix.workspace.map((item) => item.name)).toContain("@eddie/api");
  });

  it("ignores changed workspace filters for the build job", () => {
    const matrix = loadWorkspaceMatrix("build", {
      changedWorkspaces: ["@eddie/tools", "@eddie/context"],
    });

    expect(matrix.workspace.map((item) => item.name)).toEqual(EXPECTED_NAMES);
  });

  it("limits the matrix to apps and changed packages", () => {
    const matrix = loadWorkspaceMatrix("lint", {
      changedWorkspaces: ["@eddie/tools"],
    });

    expect(matrix.workspace.map((item) => item.name)).toEqual([
      "@eddie/api",
      "@eddie/web",
      "@eddie/cli",
      "@eddie/tools",
    ]);
  });

  it("returns only apps when no packages changed", () => {
    const matrix = loadWorkspaceMatrix("lint", { changedWorkspaces: [] });

    expect(matrix.workspace.map((item) => item.name)).toEqual([
      "@eddie/api",
      "@eddie/web",
      "@eddie/cli",
    ]);
  });
});

describe("selectWorkspaceNamesForPaths", () => {
  it("includes all apps even when untouched", () => {
    const names = selectWorkspaceNamesForPaths([
      "platform/integrations/tools/src/index.ts",
      "platform/runtime/context/src/index.ts",
    ]);

    expect(names).toEqual([
      "@eddie/api",
      "@eddie/web",
      "@eddie/cli",
      "@eddie/context",
      "@eddie/tools",
    ]);
  });

  it("returns only apps when changes do not map to a workspace", () => {
    const names = selectWorkspaceNamesForPaths(["README.md", "docs/guide.md"]);

    expect(names).toEqual(["@eddie/api", "@eddie/web", "@eddie/cli"]);
  });
});
