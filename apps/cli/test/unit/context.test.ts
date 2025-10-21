import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { ContextService } from "@eddie/context";
import { LoggerService } from "@eddie/io";
import { TemplateRendererService } from "@eddie/templates";
import { TemplateRuntimeService } from "@eddie/templates";
import { ConfigStore } from "@eddie/config";

const tmpDir = path.join(process.cwd(), "test-temp");
let loggerService: LoggerService;
let contextService: ContextService;

beforeAll(async () => {
  loggerService = new LoggerService();
  const templateRenderer = new TemplateRendererService(new ConfigStore());
  const templateRuntime = new TemplateRuntimeService(
    templateRenderer,
    loggerService.getLogger("engine:templates")
  );
  contextService = new ContextService(loggerService, templateRuntime);

  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(path.join(tmpDir, "a.txt"), "hello world", "utf-8");
  await fs.writeFile(path.join(tmpDir, "b.ts"), "export const x = 1;", "utf-8");
  await fs.writeFile(path.join(tmpDir, "image.png"), "not really binary", "utf-8");
  await fs.mkdir(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "node_modules", "pkg", "index.ts"),
    "export const ignored = true;",
    "utf-8"
  );
  await fs.mkdir(path.join(tmpDir, "dist"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "dist", "out.js"),
    "console.log('ignore');",
    "utf-8"
  );
  await fs.mkdir(path.join(tmpDir, "bundle"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "bundle", "info.md"),
    "bundle resource",
    "utf-8"
  );
  await fs.writeFile(
    path.join(tmpDir, "bundle", "diagram.png"),
    "fake image",
    "utf-8"
  );
  await fs.mkdir(path.join(tmpDir, "bundle", "node_modules"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "bundle", "node_modules", "pkg.js"),
    "console.log('skip bundle module');",
    "utf-8"
  );
  await fs.writeFile(
    path.join(tmpDir, "resource.jinja"),
    "Notes: {{ subject }}",
    "utf-8"
  );
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
            file: "resource.jinja",
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

  it("falls back to text-centric include patterns", async () => {
    const packed = await contextService.pack({
      baseDir: tmpDir,
    });

    const filePaths = packed.files.map((file) => file.path);
    expect(filePaths).toContain("a.txt");
    expect(filePaths).toContain("b.ts");
    expect(filePaths).not.toContain("image.png");
    expect(filePaths).not.toContain("node_modules/pkg/index.ts");
    expect(filePaths).not.toContain("dist/out.js");
  });

  it("applies fallback patterns to bundle resources", async () => {
    const packed = await contextService.pack({
      include: ["*.ts"],
      baseDir: tmpDir,
      resources: [
        {
          type: "bundle",
          id: "docs",
          name: "Docs",
          include: [],
          baseDir: tmpDir,
          virtualPath: "resources",
        },
      ],
    });

    const resource = packed.resources?.[0];
    const resourcePaths = resource?.files?.map((file) => file.path) ?? [];
    expect(resourcePaths).toContain("resources/bundle/info.md");
    expect(resourcePaths).not.toContain("resources/bundle/diagram.png");
    expect(resourcePaths).not.toContain("resources/bundle/node_modules/pkg.js");
  });
});
