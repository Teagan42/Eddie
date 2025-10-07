import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { ContextService } from "../../src/core/context/packer";
import { LoggerService } from "../../src/io/logger";

const tmpDir = path.join(process.cwd(), "test-temp");
const loggerService = new LoggerService();
const contextService = new ContextService(loggerService);

beforeAll(async () => {
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, "a.txt"), "hello world", "utf-8");
  await fs.writeFile(path.join(tmpDir, "b.ts"), "export const x = 1;", "utf-8");
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  loggerService.reset();
});

describe("packContext", () => {
  it("collects files according to include patterns", async () => {
    const packed = await contextService.pack({
      include: ["*.ts"],
      baseDir: tmpDir,
    });

    expect(packed.files.length).toBe(1);
    expect(packed.files[0].path).toBe("b.ts");
    expect(packed.text).toContain("export const x");
  });
});
