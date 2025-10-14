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
    expect(Buffer.byteLength(result.content, "utf-8")).toBe(result.data.bytes);
  });
});
