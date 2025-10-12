import { Injectable } from "@nestjs/common";
import type { TemplateVariables } from "@eddie/templates";
import type { ChatMessage, PackedContext } from "@eddie/types";
import { ToolRegistryFactory } from "@eddie/tools";
import { TemplateRendererService } from "@eddie/templates";
import type { AgentDefinition } from "./agent-definition";
import { AgentInvocation, type AgentInvocationOptions } from "./agent-invocation";

const EMPTY_CONTEXT: PackedContext = { files: [], totalBytes: 0, text: "" };

const cloneContext = (context: PackedContext): PackedContext => ({
  ...context,
  files: context.files.map((file) => ({ ...file })),
  resources: context.resources?.map((resource) => ({
    ...resource,
    files: resource.files?.map((file) => ({ ...file })),
  })),
});

const cloneHistory = (messages: ChatMessage[]): ChatMessage[] =>
  messages.map((message) => ({ ...message }));

@Injectable()
export class AgentInvocationFactory {
  constructor(
    private readonly toolRegistryFactory: ToolRegistryFactory,
    private readonly templateRenderer: TemplateRendererService
  ) {}

  async create(
    definition: AgentDefinition,
    options: AgentInvocationOptions,
    parent?: AgentInvocation
  ): Promise<AgentInvocation> {
    const sourceContext = options.context ?? definition.context ?? EMPTY_CONTEXT;
    const context = cloneContext(sourceContext);
    const history = cloneHistory(options.history ?? []);
    const builtinVariables: TemplateVariables = {
      agent: {
        id: definition.id,
      },
      prompt: options.prompt,
      context,
      history,
      systemPrompt: definition.systemPrompt,
    };

    if (parent) {
      builtinVariables.parent = {
        id: parent.definition.id,
      };
    }

    const renderVariables: TemplateVariables = {
      ...builtinVariables,
      ...(definition.variables ?? {}),
      ...(options.variables ?? {}),
    };

    const systemPrompt = definition.systemPromptTemplate
      ? await this.templateRenderer.renderTemplate(
        definition.systemPromptTemplate,
        renderVariables
      )
      : await this.templateRenderer.renderString(
        definition.systemPrompt,
        renderVariables
      );

    renderVariables.systemPrompt = systemPrompt;

    const prompt = options.promptTemplate
      ? await this.templateRenderer.renderTemplate(
        options.promptTemplate,
        renderVariables
      )
      : definition.userPromptTemplate
        ? await this.templateRenderer.renderTemplate(
          definition.userPromptTemplate,
          renderVariables
        )
        : await this.templateRenderer.renderString(
          options.prompt,
          renderVariables
        );

    const resolvedDefinition: AgentDefinition = {
      ...definition,
      systemPrompt,
    };

    const invocationOptions: AgentInvocationOptions = {
      prompt,
      context,
      history,
    };

    return new AgentInvocation(
      resolvedDefinition,
      invocationOptions,
      this.toolRegistryFactory,
      parent
    );
  }
}
