import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";

import { builtinTools } from "../src/builtin/builtin-tools";

describe("get_folder_tree_structure tool", () => {
  it("returns nested entries for directory tree", async () => {
    const tool = builtinTools.find(
      (candidate) => candidate.name === "get_folder_tree_structure",
    );
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("get_folder_tree_structure tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-tree-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    try {
      await fs.mkdir(path.join(tmpDir, "src/utils"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "src/index.ts"),
        "export const value = 1;\n",
        "utf-8",
      );
      await fs.writeFile(
        path.join(tmpDir, "src/utils/helper.ts"),
        "export const helper = () => 1;\n",
        "utf-8",
      );
      await fs.writeFile(
        path.join(tmpDir, "README.md"),
        "# Example\n",
        "utf-8",
      );

      const result = await tool.handler({ path: "." }, ctx);

      expect(result.schema).toBe("eddie.tool.get_folder_tree_structure.result.v1");
      expect(result.data).toEqual({
        root: ".",
        entries: [
          {
            name: "README.md",
            path: "README.md",
            type: "file",
          },
          {
            name: "src",
            path: "src",
            type: "directory",
            entries: [
              {
                name: "index.ts",
                path: "src/index.ts",
                type: "file",
              },
              {
                name: "utils",
                path: "src/utils",
                type: "directory",
                entries: [
                  {
                    name: "helper.ts",
                    path: "src/utils/helper.ts",
                    type: "file",
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(result.content).toContain("README.md");
      expect(result.content).toContain("src/index.ts");
      expect(result.content).toContain("src/utils/helper.ts");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns workspace-relative paths when listing a subdirectory", async () => {
    const tool = builtinTools.find(
      (candidate) => candidate.name === "get_folder_tree_structure",
    );
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("get_folder_tree_structure tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-tree-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    try {
      await fs.mkdir(path.join(tmpDir, "src/utils"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "src/index.ts"),
        "export const value = 1;\n",
        "utf-8",
      );
      await fs.writeFile(
        path.join(tmpDir, "src/utils/helper.ts"),
        "export const helper = () => 1;\n",
        "utf-8",
      );

      const result = await tool.handler({ path: "src" }, ctx);

      expect(result.data.root).toBe("src");
      expect(result.data.entries).toEqual([
        {
          name: "index.ts",
          path: "src/index.ts",
          type: "file",
        },
        {
          name: "utils",
          path: "src/utils",
          type: "directory",
          entries: [
            {
              name: "helper.ts",
              path: "src/utils/helper.ts",
              type: "file",
            },
          ],
        },
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
