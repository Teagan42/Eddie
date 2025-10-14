import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fileReadTool } from "../src/builtin/file_read";

const KB_20 = 20 * 1024;

describe("fileReadTool pagination", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-read-"));
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("reads the requested page with a 20KB maximum and reports pagination", async () => {
    const fileName = "large.txt";
    const filePath = path.join(cwd, fileName);
    const fileSize = 50 * 1024;
    await fs.writeFile(filePath, "a".repeat(fileSize), "utf-8");

    const result = await fileReadTool.handler(
      { path: fileName, page: 2 },
      {
        cwd,
        confirm: vi.fn(),
        env: process.env,
      },
    );

    expect(Buffer.byteLength(result.content, "utf-8")).toBe(KB_20);
    expect(result.data).toMatchObject({
      path: fileName,
      page: 2,
      pageSize: KB_20,
      totalBytes: fileSize,
      totalPages: 3,
      truncated: true,
    });
  });
});
