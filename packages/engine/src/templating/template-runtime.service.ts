import { Inject, Injectable, type Provider } from "@nestjs/common";
import { TemplateRendererService, type TemplateVariables } from "@eddie/templates";
import type {
  ChatMessage,
  ContextResourceTemplateConfig,
  PackedContext,
} from "@eddie/types";
import type { AgentDefinition } from "../agents/agent-definition";
import type { AgentInvocationOptions } from "../agents/agent-invocation";
import type { Logger } from "pino";
import { LoggerService } from "@eddie/io";

export const TEMPLATE_RUNTIME_LOGGER = Symbol("TEMPLATE_RUNTIME_LOGGER");

export interface ParentAgentContext {
  id: string;
}

export interface RenderSystemPromptParams {
  definition: AgentDefinition;
  options: AgentInvocationOptions;
  context: PackedContext;
  history: ChatMessage[];
  parent?: ParentAgentContext;
}

export interface RenderSystemPromptResult {
  systemPrompt: string;
  variables: TemplateVariables;
}

export interface RenderUserPromptParams {
  definition: AgentDefinition;
  options: AgentInvocationOptions;
  variables: TemplateVariables;
}

export interface RenderContextResourceParams {
  context?: PackedContext;
  history?: ChatMessage[];
  variables?: TemplateVariables;
  agent?: { id: string };
  parent?: ParentAgentContext;
}

@Injectable()
export class TemplateRuntimeService {
  constructor(
    private readonly renderer: TemplateRendererService,
    @Inject(TEMPLATE_RUNTIME_LOGGER) private readonly logger: Logger
  ) {}

  async renderSystemPrompt(
    params: RenderSystemPromptParams
  ): Promise<RenderSystemPromptResult> {
    const merged = this.mergeVariables(
      this.createBuiltinVariables(params),
      params.definition.variables,
      params.options.variables
    );

    let systemPrompt: string;
    if (params.definition.systemPromptTemplate) {
      systemPrompt = await this.renderer.renderTemplate(
        params.definition.systemPromptTemplate,
        merged
      );
    } else {
      systemPrompt = await this.renderer.renderString(
        params.definition.systemPrompt,
        merged
      );
    }

    merged.systemPrompt = systemPrompt;
    this.logger?.debug?.(
      { agentId: params.definition.id },
      "Rendered system prompt"
    );

    return {
      systemPrompt,
      variables: merged,
    };
  }

  async renderUserPrompt(params: RenderUserPromptParams): Promise<string> {
    const { definition, options } = params;

    const template = options.promptTemplate ?? definition.userPromptTemplate;
    if (template) {
      const rendered = await this.renderer.renderTemplate(
        template,
        params.variables
      );
      this.logger?.debug?.(
        { agentId: definition.id },
        "Rendered user prompt from template"
      );
      return rendered;
    }

    const rendered = await this.renderer.renderString(
      options.prompt,
      params.variables
    );
    this.logger?.debug?.(
      { agentId: definition.id },
      "Rendered user prompt from string"
    );
    return rendered;
  }

  async renderContextResource(
    resource: ContextResourceTemplateConfig,
    params: RenderContextResourceParams
  ): Promise<string> {
    const merged = this.mergeVariables(
      params.context ? { context: params.context } : undefined,
      params.history ? { history: params.history } : undefined,
      params.agent ? { agent: params.agent } : undefined,
      params.parent ? { parent: params.parent } : undefined,
      params.variables,
      resource.variables
    );

    const rendered = await this.renderer.renderTemplate(
      resource.template,
      merged
    );
    const text = rendered.trimEnd();
    this.logger?.debug?.(
      { resourceId: resource.id },
      "Rendered context resource"
    );
    return text;
  }

  private createBuiltinVariables(
    params: RenderSystemPromptParams
  ): TemplateVariables {
    const builtin: TemplateVariables = {
      agent: { id: params.definition.id },
      prompt: params.options.prompt,
      context: params.context,
      history: params.history,
      systemPrompt: params.definition.systemPrompt,
    };

    if (params.parent) {
      builtin.parent = params.parent;
    }

    return builtin;
  }

  private mergeVariables(
    ...sources: Array<TemplateVariables | undefined>
  ): TemplateVariables {
    const result: TemplateVariables = {};

    for (const source of sources) {
      if (!source) {
        continue;
      }

      for (const [key, value] of Object.entries(source)) {
        result[key] = this.mergeValue(result[key], value);
      }
    }

    return result;
  }

  private mergeValue(existing: unknown, incoming: unknown): unknown {
    if (this.isPlainObject(incoming)) {
      const base = this.isPlainObject(existing)
        ? (existing as Record<string, unknown>)
        : undefined;
      return this.mergePlainObjects(base, incoming);
    }

    return incoming;
  }

  private mergePlainObjects(
    existing: Record<string, unknown> | undefined,
    incoming: Record<string, unknown>
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = existing
      ? { ...existing }
      : {};

    for (const [childKey, childValue] of Object.entries(incoming)) {
      merged[childKey] = this.mergeValue(existing?.[childKey], childValue);
    }

    return merged;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
}

export const templateRuntimeProviders: Provider[] = [
  TemplateRuntimeService,
  {
    provide: TEMPLATE_RUNTIME_LOGGER,
    useFactory: (loggerService: LoggerService): Logger =>
      loggerService.getLogger("engine:templates"),
    inject: [LoggerService],
  },
];
