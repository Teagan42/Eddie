import "reflect-metadata";
import fs from "fs/promises";
import path from "path";
import { describe, it, expect } from "vitest";

import { ConfigService } from "../../src/config/config.service";
import type { TemplateDescriptor } from "../../src/shared/template.types";

const projectRoot = path.resolve(__dirname, "../../../../");

const resolveFromRepo = (relative: string) =>
  path.resolve(projectRoot, relative);

const ensureTemplateAssets = async (descriptor: TemplateDescriptor) => {
  const baseDir = descriptor.baseDir
    ? path.resolve(projectRoot, descriptor.baseDir)
    : projectRoot;
  const absolutePath = path.resolve(baseDir, descriptor.file);

  await fs.access(absolutePath);
  const source = await fs.readFile(absolutePath, "utf-8");
  const referencePattern = /(?:layout|include)\(\s*(["'])([^"']+)\1/g;
  const dir = path.dirname(absolutePath);

  for (const match of source.matchAll(referencePattern)) {
    const reference = match[2];
    const candidate = path.resolve(
      dir,
      path.extname(reference) ? reference : `${reference}.eta`
    );
    await fs.access(candidate);
  }
};

describe("documentation examples", () => {
  const service = new ConfigService();

  it("loads and validates the standalone architecture audit example", async () => {
    const config = await service.load({
      config: resolveFromRepo("examples/standalone/eddie.config.yaml"),
    });

    expect(config.agents.mode).toBe("single");
    expect(config.agents.subagents).toHaveLength(0);
    expect(config.context.baseDir).toBe("../..");

    const managerTemplate = config.agents.manager.promptTemplate;
    expect(managerTemplate?.file).toBe("system.eta");
    expect(managerTemplate?.baseDir).toBe("./examples/standalone/prompts");
    await ensureTemplateAssets(managerTemplate!);

    const userTemplate = config.agents.manager.defaultUserPromptTemplate;
    expect(userTemplate?.file).toBe("user.eta");
    await ensureTemplateAssets(userTemplate!);
  });

  it("loads and validates the router subagent triage example", async () => {
    const config = await service.load({
      config: resolveFromRepo("examples/subagent/eddie.config.yaml"),
    });

    expect(config.agents.mode).toBe("router");
    expect(config.agents.subagents.map((agent) => agent.id)).toEqual([
      "planner",
      "qa",
    ]);
    expect(config.agents.routing?.confidenceThreshold).toBe(0.55);

    const managerTemplate = config.agents.manager.promptTemplate;
    expect(managerTemplate?.file).toBe("manager.eta");
    await ensureTemplateAssets(managerTemplate!);

    for (const subagent of config.agents.subagents) {
      const prompt = subagent.promptTemplate;
      expect(prompt?.baseDir).toBe("./examples/subagent/prompts");
      await ensureTemplateAssets(prompt!);

      const userTemplate = subagent.defaultUserPromptTemplate;
      if (userTemplate) {
        await ensureTemplateAssets(userTemplate);
      }
    }

    const defaultUser = config.agents.manager.defaultUserPromptTemplate;
    expect(defaultUser?.file).toBe("user.eta");
    await ensureTemplateAssets(defaultUser!);
  });
});
