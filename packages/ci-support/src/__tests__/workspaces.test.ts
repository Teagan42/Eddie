import { describe, expect, it } from "vitest";

import {
  getWorkspaceByName,
  loadWorkspaceMatrix,
  loadWorkspaces,
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
});
