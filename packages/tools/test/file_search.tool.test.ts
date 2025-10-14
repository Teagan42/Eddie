import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";

import { builtinTools } from "../src/builtin/builtin-tools";

describe("file_search tool", () => {
  it("finds files whose content matches a regular expression", async () => {
    const tool = builtinTools.find((candidate) => candidate.name === "file_search");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("file_search tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-search-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    const matchingPath = path.join(tmpDir, "match.txt");
    const nonMatchingPath = path.join(tmpDir, "skip.txt");
    await fs.writeFile(matchingPath, "hello world", "utf-8");
    await fs.writeFile(nonMatchingPath, "unrelated", "utf-8");

    try {
      const result = await tool.handler(
        {
          content: "hello\\s+world",
        },
        ctx,
      );

      expect(result.schema).toBe("eddie.tool.file_search.result.v1");
      expect(result.data.totalResults).toBe(1);
      expect(result.data.results).toEqual([
        {
          path: "match.txt",
          lineMatches: [
            {
              lineNumber: 1,
              line: "hello world",
              matches: [
                {
                  match: "hello world",
                  start: 0,
                  end: 11,
                  groups: [],
                },
              ],
            },
          ],
        },
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("filters files by name using a regular expression", async () => {
    const tool = builtinTools.find((candidate) => candidate.name === "file_search");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("file_search tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-search-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    await fs.writeFile(path.join(tmpDir, "report.md"), "# Title", "utf-8");
    await fs.writeFile(path.join(tmpDir, "notes.txt"), "notes", "utf-8");

    try {
      const result = await tool.handler(
        {
          name: "report\\.md$",
        },
        ctx,
      );

      expect(result.schema).toBe("eddie.tool.file_search.result.v1");
      expect(result.data.totalResults).toBe(1);
      expect(result.data.results).toEqual([
        {
          path: "report.md",
          lineMatches: [],
        },
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("applies include and exclude path filters using regular expressions", async () => {
    const tool = builtinTools.find((candidate) => candidate.name === "file_search");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("file_search tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-search-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    const srcDir = path.join(tmpDir, "src");
    const docsDir = path.join(tmpDir, "docs");
    await fs.mkdir(srcDir);
    await fs.mkdir(docsDir);

    await fs.writeFile(path.join(srcDir, "match.ts"), "const value = 'needle';\n", "utf-8");
    await fs.writeFile(path.join(docsDir, "ignore.md"), "needle appears here too", "utf-8");

    try {
      const result = await tool.handler(
        {
          content: "needle",
          include: ["src/.*", "docs/.*"],
          exclude: ["docs/.*"],
        },
        ctx,
      );

      expect(result.schema).toBe("eddie.tool.file_search.result.v1");
      expect(result.data.totalResults).toBe(1);
      expect(result.data.results).toEqual([
        {
          path: "src/match.ts",
          lineMatches: [
            {
              lineNumber: 1,
              line: "const value = 'needle';",
              matches: [
                {
                  match: "needle",
                  start: 15,
                  end: 21,
                  groups: [],
                },
              ],
            },
          ],
        },
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("paginates search results", async () => {
    const tool = builtinTools.find((candidate) => candidate.name === "file_search");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("file_search tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-search-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    await fs.writeFile(path.join(tmpDir, "a.txt"), "match", "utf-8");
    await fs.writeFile(path.join(tmpDir, "b.txt"), "match", "utf-8");
    await fs.writeFile(path.join(tmpDir, "c.txt"), "match", "utf-8");

    try {
      const result = await tool.handler(
        {
          content: "match",
          page: 2,
          pageSize: 1,
        },
        ctx,
      );

      expect(result.schema).toBe("eddie.tool.file_search.result.v1");
      expect(result.data.totalResults).toBe(3);
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(1);
      expect(result.data.totalPages).toBe(3);
      expect(result.data.results).toEqual([
        {
          path: "b.txt",
          lineMatches: [
            {
              lineNumber: 1,
              line: "match",
              matches: [
                { match: "match", start: 0, end: 5, groups: [] },
              ],
            },
          ],
        },
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects non-string content arguments", async () => {
    const tool = builtinTools.find((candidate) => candidate.name === "file_search");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("file_search tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-search-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    try {
      await expect(
        tool.handler(
          {
            // @ts-expect-error intentional invalid input for runtime validation
            content: { pattern: "match" },
          },
          ctx,
        ),
      ).rejects.toThrow("content pattern must be a string");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
