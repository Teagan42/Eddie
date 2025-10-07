import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { packContext } from "../../src/core/context/packer";

const tmpDir = path.join(process.cwd(), "test-temp");

beforeAll(async () => {
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, "a.txt"), "hello world", "utf-8");
  await fs.writeFile(path.join(tmpDir, "b.ts"), "export const x = 1;", "utf-8");
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("packContext", () => {
  it("collects files according to include patterns", async () => {
    const packed = await packContext({
      include: ["*.ts"],
      baseDir: tmpDir,
    });

    expect(packed.files.length).toBe(1);
    expect(packed.files[0].path).toBe("b.ts");
    expect(packed.text).toContain("export const x");
  });
});
