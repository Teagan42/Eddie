import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import path from "path";
import {
  AgentInvocationFactory,
  type AgentDefinition,
} from "@eddie/engine";
import { ToolRegistryFactory } from "@eddie/tools";
import type { PackedContext } from "@eddie/types";
import { TemplateRendererService } from "@eddie/templates";

const tmpDir = path.join(process.cwd(), "test-temp", "agent-factory");
let factory: AgentInvocationFactory;

beforeAll(async () => {
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "system.jinja"),
    "System ({{ agent.id }}): {{ role }}",
    "utf-8"
  );
  await fs.writeFile(
    path.join(tmpDir, "user.jinja"),
    "User ({{ systemPrompt }}): {{ role }} - {{ prompt }}",
    "utf-8"
  );

  const templateRenderer = new TemplateRendererService();
  const toolRegistryFactory = new ToolRegistryFactory();
  factory = new AgentInvocationFactory(toolRegistryFactory, templateRenderer);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("AgentInvocationFactory", () => {
  it("renders system and user templates with runtime variables", async () => {
    const definition: AgentDefinition = {
      id: "manager",
      systemPrompt: "fallback",
      systemPromptTemplate: {
        file: "system.jinja",
        baseDir: tmpDir,
      },
      userPromptTemplate: {
        file: "user.jinja",
        baseDir: tmpDir,
      },
      variables: { role: "architect" },
    };

    const context: PackedContext = { files: [], totalBytes: 0, text: "" };

    const invocation = await factory.create(
      definition,
      {
        prompt: "Implement feature",
        context,
        variables: { role: "engineer" },
      }
    );

    expect(invocation.definition.systemPrompt).toBe(
      "System (manager): engineer"
    );
    expect(invocation.messages[0].content).toBe(
      "System (manager): engineer"
    );
    expect(invocation.messages[1].content).toBe(
      "User (System (manager): engineer): engineer - Implement feature"
    );
  });

  it("renders inline prompts when templates are absent", async () => {
    const definition: AgentDefinition = {
      id: "manager",
      systemPrompt: "Hello {{ agent.id }}",
    };

    const invocation = await factory.create(
      definition,
      {
        prompt: "Do work as {{ role }}",
        variables: { role: "tester" },
      }
    );

    expect(invocation.definition.systemPrompt).toBe("Hello manager");
    expect(invocation.messages[1].content).toBe("Do work as tester");
  });
});
