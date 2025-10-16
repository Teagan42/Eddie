import { Injectable } from "@nestjs/common";
import type { ChatMessage, PackedContext } from "@eddie/types";
import { ToolRegistryFactory } from "@eddie/tools";
import type { AgentDefinition } from "./agent-definition";
import { AgentInvocation, type AgentInvocationOptions } from "./agent-invocation";
import {
  TemplateRuntimeService,
  type ParentAgentContext,
} from "../templating/template-runtime.service";

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
    private readonly templateRuntime: TemplateRuntimeService
  ) {}

  async create(
    definition: AgentDefinition,
    options: AgentInvocationOptions,
    parent?: AgentInvocation
  ): Promise<AgentInvocation> {
    const sourceContext = options.context ?? definition.context ?? EMPTY_CONTEXT;
    const context = cloneContext(sourceContext);
    const history = cloneHistory(options.history ?? []);
    const parentContext: ParentAgentContext | undefined = parent
      ? { id: parent.definition.id }
      : undefined;

    const system = await this.templateRuntime.renderSystemPrompt({
      definition,
      options,
      context,
      history,
      parent: parentContext,
    });

    const prompt = await this.templateRuntime.renderUserPrompt({
      definition,
      options,
      variables: system.variables,
    });

    const resolvedDefinition: AgentDefinition = {
      ...definition,
      systemPrompt: system.systemPrompt,
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
