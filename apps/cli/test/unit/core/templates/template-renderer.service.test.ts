import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { TemplateRendererService } from "../../../../src/core/templates/template-renderer.service";

const tmpDir = path.join(process.cwd(), "test-temp", "templates");
let service: TemplateRendererService;
let templatePath: string;

beforeAll(async () => {
  service = new TemplateRendererService();
  await fs.mkdir(tmpDir, { recursive: true });
  templatePath = path.join(tmpDir, "message.eta");
  await fs.writeFile(
    templatePath,
    "Hello <%= name %> from <%= origin %>",
    "utf-8"
  );
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("TemplateRendererService", () => {
  it("renders template files with merged variables", async () => {
    const output = await service.renderTemplate(
      {
        file: path.basename(templatePath),
        baseDir: tmpDir,
        variables: { origin: "base" },
      },
      { name: "Ada", origin: "override" }
    );

    expect(output).toBe("Hello Ada from override");
  });

  it("renders inline templates", async () => {
    const output = await service.renderString(
      "Task: <%= subject %> for <%= assignee %>",
      {
        subject: "Refactor",
        assignee: "Bob",
      }
    );

    expect(output).toBe("Task: Refactor for Bob");
  });
});
