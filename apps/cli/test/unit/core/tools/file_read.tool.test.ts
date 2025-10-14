import { afterAll, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { fileReadTool } from "@eddie/tools";

const tempDirs: string[] = [];
const DEFAULT_PAGE_SIZE = 20 * 1024;

const createContext = (cwd: string) => ({
  cwd,
  confirm: vi.fn(),
  env: process.env,
});

describe("fileReadTool", () => {
  afterAll(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("reads files relative to the provided context cwd", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-read-"));
    tempDirs.push(tmpDir);

    const fileName = "example.txt";
    await fs.writeFile(path.join(tmpDir, fileName), "hello from ctx", "utf-8");

    const result = await fileReadTool.handler({ path: fileName }, createContext(tmpDir));

    expect(result.schema).toBe("eddie.tool.file_read.result.v1");
    expect(result.content).toBe("hello from ctx");
    expect(result.data).toEqual({
      path: fileName,
      bytes: Buffer.byteLength("hello from ctx", "utf-8"),
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      totalBytes: Buffer.byteLength("hello from ctx", "utf-8"),
      totalPages: 1,
      truncated: false,
    });
  });

  it("truncates content when maxBytes is provided", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-read-"));
    tempDirs.push(tmpDir);

    const fileName = "truncate.txt";
    await fs.writeFile(path.join(tmpDir, fileName), "abcdef", "utf-8");

    const result = await fileReadTool.handler({ path: fileName, maxBytes: 3 }, createContext(tmpDir));

    expect(result.schema).toBe("eddie.tool.file_read.result.v1");
    expect(result.content).toBe("abc");
    expect(result.data).toEqual({
      path: fileName,
      bytes: Buffer.byteLength("abc", "utf-8"),
      page: 1,
      pageSize: 3,
      totalBytes: Buffer.byteLength("abcdef", "utf-8"),
      totalPages: 2,
      truncated: true,
    });
  });

  it("serves complete multi-byte characters across pages", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-file-read-"));
    tempDirs.push(tmpDir);

    const fileName = "emoji.txt";
    const content = "foo😊";
    const pageSize = 5;
    const totalBytes = Buffer.byteLength(content, "utf-8");
    const totalPages = Math.max(1, Math.ceil(totalBytes / pageSize));

    await fs.writeFile(path.join(tmpDir, fileName), content, "utf-8");

    const firstPage = await fileReadTool.handler(
      { path: fileName, page: 1, pageSize },
      createContext(tmpDir),
    );

    expect(firstPage.schema).toBe("eddie.tool.file_read.result.v1");
    expect(firstPage.content).toBe("foo");
    expect(firstPage.data).toEqual({
      path: fileName,
      bytes: Buffer.byteLength("foo", "utf-8"),
      truncated: true,
      page: 1,
      pageSize,
      totalBytes,
      totalPages,
    });

    const secondPage = await fileReadTool.handler(
      { path: fileName, page: 2, pageSize },
      createContext(tmpDir),
    );

    expect(secondPage.schema).toBe("eddie.tool.file_read.result.v1");
    expect(secondPage.content).toBe("😊");
    expect(secondPage.data).toEqual({
      path: fileName,
      bytes: Buffer.byteLength("😊", "utf-8"),
      truncated: false,
      page: 2,
      pageSize,
      totalBytes,
      totalPages,
    });
  });
});
