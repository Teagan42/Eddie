import { afterAll, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
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
});
