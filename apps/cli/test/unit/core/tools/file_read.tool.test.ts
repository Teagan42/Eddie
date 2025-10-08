import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { fileReadTool } from "../../../../src/core/tools/builtin/file_read";

const tempDirs: string[] = [];

describe("fileReadTool", () => {
  afterAll(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("reads files relative to the provided context cwd", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-read-"));
    tempDirs.push(tmpDir);

    const fileName = "example.txt";
    await fs.writeFile(path.join(tmpDir, fileName), "hello from ctx", "utf-8");

    const result = await fileReadTool.handler(
      { path: fileName },
      {
        cwd: tmpDir,
        confirm: vi.fn(),
        env: process.env,
      },
    );

    expect(result.schema).toBe("eddie.tool.file_read.result.v1");
    expect(result.content).toBe("hello from ctx");
    expect(result.data).toEqual({
      path: fileName,
      bytes: Buffer.byteLength("hello from ctx", "utf-8"),
      truncated: false,
    });
  });

  it("truncates content when maxBytes is provided", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-read-"));
    tempDirs.push(tmpDir);

    const fileName = "truncate.txt";
    await fs.writeFile(path.join(tmpDir, fileName), "abcdef", "utf-8");

    const result = await fileReadTool.handler(
      { path: fileName, maxBytes: 3 },
      {
        cwd: tmpDir,
        confirm: vi.fn(),
        env: process.env,
      },
    );

    expect(result.schema).toBe("eddie.tool.file_read.result.v1");
    expect(result.content).toBe("abc");
    expect(result.data).toEqual({
      path: fileName,
      bytes: Buffer.byteLength("abc", "utf-8"),
      truncated: true,
    });
  });
});
