import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fileReadTool } from "../src/builtin/file_read";

describe("fileReadTool", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-read-"));
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("limits reads to maxBytes without using readFile", async () => {
    const fileName = "large.txt";
    const filePath = path.join(cwd, fileName);
    const multiByte = "😀";
    await fs.writeFile(filePath, multiByte.repeat(4096), "utf-8");

    const readFileSpy = vi.spyOn(fs, "readFile");

    const result = await fileReadTool.handler(
      { path: fileName, maxBytes: 1024 },
      {
        cwd,
        confirm: vi.fn(),
        env: process.env,
      },
    );

    expect(readFileSpy).not.toHaveBeenCalled();
    expect(result.data.truncated).toBe(true);
    expect(result.data.bytes).toBeLessThanOrEqual(1024);
    expect(result.data).toMatchObject({
      path: fileName,
      page: 1,
      pageSize: 1024,
      totalBytes: 16384,
      totalPages: 16,
    });
    expect(Buffer.byteLength(result.content, "utf-8")).toBe(result.data.bytes);
  });

  it("does not return partial multibyte characters when maxBytes cuts inside", async () => {
    const fileName = "partial.txt";
    const filePath = path.join(cwd, fileName);
    await fs.writeFile(filePath, "😀text", "utf-8");

    const result = await fileReadTool.handler(
      { path: fileName, maxBytes: 1 },
      {
        cwd,
        confirm: vi.fn(),
        env: process.env,
      },
    );

    expect(result.content).toBe("");
    expect(result.data.bytes).toBe(0);
    expect(result.data.truncated).toBe(true);
    expect(result.data).toMatchObject({
      path: fileName,
      page: 1,
      pageSize: 1,
      totalBytes: 8,
      totalPages: 8,
    });
    expect(Buffer.byteLength(result.content, "utf-8")).toBe(result.data.bytes);
  });
});
