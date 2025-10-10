import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import { TemplateRendererService } from "@eddie/templates";

const tmpDir = path.join(process.cwd(), "test-temp", "templates");
let service: TemplateRendererService;
let templatePath: string;
let layoutTemplatePath: string;
let childTemplatePath: string;

beforeAll(async () => {
  service = new TemplateRendererService();
  await fs.mkdir(tmpDir, { recursive: true });
  templatePath = path.join(tmpDir, "message.jinja");
  await fs.writeFile(
    templatePath,
    "Hello {{ name }} from {{ origin }}",
    "utf-8"
  );

  layoutTemplatePath = path.join(tmpDir, "layout.jinja");
  await fs.writeFile(
    layoutTemplatePath,
    "<h1>{{ title }}</h1>\n<section>\n{% block content %}{% endblock %}\n</section>",
    "utf-8"
  );

  childTemplatePath = path.join(tmpDir, "child.jinja");
  await fs.writeFile(
    childTemplatePath,
    "{% extends 'layout.jinja' %}\n{% block content %}\n<p>{{ content }}</p>\n{% endblock %}",
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
      "Task: {{ subject }} for {{ assignee }}",
      {
        subject: "Refactor",
        assignee: "Bob",
      }
    );

    expect(output).toBe("Task: Refactor for Bob");
  });

  it("renders templates that use Jinja inheritance", async () => {
    const output = await service.renderTemplate(
      {
        file: path.basename(childTemplatePath),
        baseDir: tmpDir,
      },
      {
        content: "Welcome to the session.",
        title: "Session Briefing",
      }
    );

    expect(output).toContain("<h1>Session Briefing</h1>");
    expect(output).toContain("<p>Welcome to the session.</p>");
  });
});
