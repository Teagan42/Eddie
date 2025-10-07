import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import fs from "fs/promises";
import path from "path";
import { ContextService } from "../../src/core/context";
import { LoggerService } from "../../src/io/logger";

const tmpDir = path.join(process.cwd(), "test-temp");
let moduleRef: TestingModule;
let loggerService: LoggerService;
let contextService: ContextService;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [
      LoggerService,
      {
        provide: ContextService,
        useFactory: (logger: LoggerService) => new ContextService(logger),
        inject: [LoggerService],
      },
    ],
  }).compile();

  loggerService = moduleRef.get(LoggerService);
  contextService = moduleRef.get(ContextService);

  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, "a.txt"), "hello world", "utf-8");
  await fs.writeFile(path.join(tmpDir, "b.ts"), "export const x = 1;", "utf-8");
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  loggerService.reset();
  await moduleRef.close();
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
