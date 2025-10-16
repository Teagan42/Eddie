import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TemplateDescriptor,
  TemplateVariables,
} from "../src/template.types";
import type {
  AgentDefinition,
  AgentInvocationOptions,
  ChatMessage,
  ContextResourceTemplateConfig,
  PackedContext,
} from "@eddie/types";
import { TemplateRuntimeService } from "../src/template-runtime.service";
import { TemplateRendererService } from "../src/template-renderer.service";
import type { Logger } from "pino";

class TemplateRendererStub {
  renderTemplate = vi.fn(
    async (
      _descriptor: TemplateDescriptor,
      variables: TemplateVariables = {}
    ) => {
      return `template:${variables.prompt ?? ""}`;
    }
  );

  renderString = vi.fn(
    async (template: string, variables: TemplateVariables = {}) => {
      return `${template}:${variables.agent?.id ?? "unknown"}`;
    }
  );
}

describe("TemplateRuntimeService", () => {
  let renderer: TemplateRendererStub;
  let service: TemplateRuntimeService;
  let logger: Logger;

  beforeEach(() => {
    renderer = new TemplateRendererStub();
    logger = {
      debug: vi.fn(),
      child: vi.fn(() => logger),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      level: "info",
    } as unknown as Logger;

    service = new TemplateRuntimeService(
      renderer as unknown as TemplateRendererService,
      logger
    );
  });

  it("merges agent, context, and override variables when rendering the system prompt", async () => {
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "You are {{ agent.id }}",
      systemPromptTemplate: { file: "./system.njk" } as TemplateDescriptor,
      variables: {
        prompt: "definition prompt",
        agent: { id: "definition" },
      },
    };
    const options: AgentInvocationOptions = {
      prompt: "runtime prompt",
      variables: {
        agent: { id: "runtime" },
        prompt: "override prompt",
      },
    };
    const context: PackedContext = { files: [], text: "ctx", totalBytes: 0 };
    const history: ChatMessage[] = [{ role: "user", content: "hi" }];

    const result = await service.renderSystemPrompt({
      definition,
      options,
      context,
      history,
    });

    expect(renderer.renderTemplate).toHaveBeenCalledWith(
      definition.systemPromptTemplate,
      expect.objectContaining({
        agent: { id: "runtime" },
        context,
        history,
        prompt: "override prompt",
      })
    );
    expect(result.systemPrompt).toBe("template:override prompt");
    expect(result.variables.systemPrompt).toBe(result.systemPrompt);
  });

  it("includes parent agent variables when rendering the system prompt", async () => {
    const definition: AgentDefinition = {
      id: "child",
      systemPrompt: "Child",
    };
    const context: PackedContext = { files: [], text: "ctx", totalBytes: 0 };
    const history: ChatMessage[] = [];
    const parent = {
      id: "parent",
    };

    await service.renderSystemPrompt({
      definition,
      options: { prompt: "hello" },
      context,
      history,
      parent,
    });

    expect(renderer.renderString).toHaveBeenCalledWith(
      definition.systemPrompt,
      expect.objectContaining({
        parent: { id: "parent" },
      })
    );
  });

  it("deep merges nested template variables from definition and invocation", async () => {
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "System",
      variables: {
        agent: {
          metadata: {
            capabilities: ["plan"],
          },
        },
      },
    };

    const options: AgentInvocationOptions = {
      prompt: "Run",
      variables: {
        agent: {
          metadata: {
            selected: true,
          },
        },
      },
    };

    const context: PackedContext = { files: [], text: "ctx", totalBytes: 0 };

    const result = await service.renderSystemPrompt({
      definition,
      options,
      context,
      history: [],
    });

    expect(result.variables.agent).toEqual({
      id: "planner",
      metadata: {
        capabilities: ["plan"],
        selected: true,
      },
    });
  });

  it("renders context resource templates with merged variables", async () => {
    const context: PackedContext = { files: [], text: "ctx", totalBytes: 0 };
    const history: ChatMessage[] = [];

    await service.renderSystemPrompt({
      definition: { id: "planner", systemPrompt: "System" },
      options: { prompt: "Do work" },
      context,
      history,
    });

    const resource: ContextResourceTemplateConfig = {
      id: "notes",
      type: "template",
      template: { file: "./resource.njk" } as TemplateDescriptor,
      variables: { prompt: "resource" },
    };

    const result = await service.renderContextResource(resource, {
      context,
      variables: { prompt: "base" },
    });

    expect(renderer.renderTemplate).toHaveBeenCalledWith(
      resource.template,
      expect.objectContaining({ prompt: "resource" })
    );
    expect(result).toBe("template:resource");
  });

  it("prefers explicit prompt templates over defaults when rendering user prompts", async () => {
    renderer.renderTemplate.mockImplementationOnce(async () => "system");
    renderer.renderTemplate.mockImplementationOnce(async () => "invocation");
    const definition: AgentDefinition = {
      id: "planner",
      systemPrompt: "System",
      systemPromptTemplate: { file: "./system.njk" } as TemplateDescriptor,
      userPromptTemplate: { file: "./user.njk" } as TemplateDescriptor,
    };
    const options: AgentInvocationOptions = {
      prompt: "Do work",
      promptTemplate: { file: "./override.njk" } as TemplateDescriptor,
    };
    const context: PackedContext = { files: [], text: "ctx", totalBytes: 0 };

    const system = await service.renderSystemPrompt({
      definition,
      options,
      context,
      history: [],
    });

    const prompt = await service.renderUserPrompt({
      definition,
      options,
      variables: system.variables,
    });

    expect(renderer.renderTemplate).toHaveBeenNthCalledWith(
      2,
      options.promptTemplate,
      expect.objectContaining({ systemPrompt: "system" })
    );
    expect(prompt).toBe("invocation");
  });
});
