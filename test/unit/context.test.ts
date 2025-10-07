import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import fs from "fs/promises";
import path from "path";
import { ContextService } from "../../src/core/context";
import { LoggerService } from "../../src/io";
import { TemplateRendererService } from "../../src/core/templates";

const tmpDir = path.join(process.cwd(), "test-temp");
let moduleRef: TestingModule;
let loggerService: LoggerService;
let contextService: ContextService;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [
      LoggerService,
      TemplateRendererService,
      {
        provide: ContextService,
        useFactory: (
          logger: LoggerService,
          renderer: TemplateRendererService
        ) => new ContextService(logger, renderer),
        inject: [LoggerService, TemplateRendererService],
      },
    ],
  }).compile();

  loggerService = moduleRef.get(LoggerService);
  contextService = moduleRef.get(ContextService);

  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, "a.txt"), "hello world", "utf-8");
  await fs.writeFile(path.join(tmpDir, "b.ts"), "export const x = 1;", "utf-8");
  await fs.mkdir(path.join(tmpDir, "bundle"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "bundle", "info.md"),
    "bundle resource",
    "utf-8"
  );
  await fs.writeFile(
    path.join(tmpDir, "resource.eta"),
    "Notes: <%= subject %>",
    "utf-8"
  );
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

  it("renders template resources alongside context files", async () => {
    const packed = await contextService.pack({
      include: ["*.ts"],
      baseDir: tmpDir,
      resources: [
        {
          type: "template",
          id: "notes",
          name: "Notes",
          template: {
            file: "resource.eta",
            baseDir: tmpDir,
          },
          variables: { subject: "Testing" },
        },
      ],
    });

    expect(packed.resources?.length).toBe(1);
    const resource = packed.resources?.[0];
    expect(resource?.text).toContain("Testing");
    expect(packed.text).toContain("Resource: Notes");
    expect(packed.totalBytes).toBeGreaterThan(0);
  });

  it("packs bundle resources with virtual paths", async () => {
    const packed = await contextService.pack({
      include: ["*.ts"],
      baseDir: tmpDir,
      resources: [
        {
          type: "bundle",
          id: "docs",
          name: "Docs",
          include: ["bundle/*.md"],
          baseDir: tmpDir,
          virtualPath: "resources",
        },
      ],
    });

    expect(packed.resources?.length).toBe(1);
    const resource = packed.resources?.[0];
    expect(resource?.files?.[0].path).toBe("resources/bundle/info.md");
    expect(packed.text).toContain("Resource: Docs");
  });
});
