import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";

import { builtinTools } from "../src/builtin/builtin-tools";

describe("file_read tool", () => {
  it("caps UTF-8 output by byte length", async () => {
    const tool = builtinTools.find((candidate) => candidate.name === "file_read");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("file_read tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-read-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    const filePath = path.join(tmpDir, "emoji.txt");
    await fs.writeFile(filePath, "😀😀", "utf-8");

    try {
      const result = await tool.handler(
        {
          path: "emoji.txt",
          maxBytes: 4,
        },
        ctx,
      );

      expect(result.schema).toBe("eddie.tool.file_read.result.v1");
      expect(result.content).toBe("😀");
      expect(result.data).toEqual({
        path: "emoji.txt",
        bytes: 4,
        truncated: true,
        page: 1,
        pageSize: 4,
        totalBytes: 8,
        totalPages: 2,
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("omits trailing partial UTF-8 code points", async () => {
    const tool = builtinTools.find((candidate) => candidate.name === "file_read");
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("file_read tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-read-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    const filePath = path.join(tmpDir, "emoji.txt");
    await fs.writeFile(filePath, "😀😀", "utf-8");

    try {
      const result = await tool.handler(
        {
          path: "emoji.txt",
          maxBytes: 5,
        },
        ctx,
      );

      expect(result.schema).toBe("eddie.tool.file_read.result.v1");
      expect(result.content).toBe("😀");
      expect(Buffer.from(result.content, "utf-8").byteLength).toBeLessThanOrEqual(5);
      expect(result.data).toEqual({
        path: "emoji.txt",
        bytes: 4,
        truncated: true,
        page: 1,
        pageSize: 5,
        totalBytes: 8,
        totalPages: 2,
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
