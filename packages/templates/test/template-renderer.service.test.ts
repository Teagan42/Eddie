import { afterAll, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import nunjucks from "nunjucks";
import { TemplateRendererService } from "../src/template-renderer.service";

describe("TemplateRendererService", () => {
  const service = new TemplateRendererService();
  const tempDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(
      tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }))
    );
  });

  it("re-renders cached template when file contents change", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "template-test-"));
    tempDirs.push(tmpDir);

    const templatePath = path.join(tmpDir, "greeting.njk");
    await fs.writeFile(templatePath, "Hello {{ name }}", "utf-8");

    const firstRender = await service.renderTemplate(
      { file: templatePath },
      { name: "World" }
    );

    expect(firstRender).toBe("Hello World");

    await new Promise((resolve) => setTimeout(resolve, 20));

    await fs.writeFile(templatePath, "Updated {{ name }}", "utf-8");

    const secondRender = await service.renderTemplate(
      { file: templatePath },
      { name: "World" }
    );

    expect(secondRender).toBe("Updated World");
  });

  it("rebuilds cached template when stored instance is missing", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "template-cache-"));
    tempDirs.push(tmpDir);

    const templatePath = path.join(tmpDir, "welcome.njk");
    await fs.writeFile(templatePath, "Hi {{ name }}", "utf-8");

    const stats = await fs.stat(templatePath);
    const searchPaths = [path.dirname(templatePath)];
    const cacheKey = `${searchPaths.join("|")}:${templatePath}`;
    service["templateCache"].set(cacheKey, {
      template: undefined as unknown as nunjucks.Template,
      mtimeMs: stats.mtimeMs,
    });

    const rendered = await service.renderTemplate(
      { file: templatePath },
      { name: "Coder" }
    );

    expect(rendered).toBe("Hi Coder");
    const cacheEntry = service["templateCache"].get(cacheKey);
    expect(cacheEntry?.template).toBeInstanceOf(nunjucks.Template);
  });
});
