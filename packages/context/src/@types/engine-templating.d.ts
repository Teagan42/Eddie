import type { Provider } from "@nestjs/common";
import type { TemplateVariables } from "@eddie/templates";
import type {
  ChatMessage,
  ContextResourceTemplateConfig,
  PackedContext,
} from "@eddie/types";

export interface ParentAgentContext {
  id: string;
}

export interface RenderContextResourceParams {
  context?: PackedContext;
  history?: ChatMessage[];
  variables?: TemplateVariables;
  agent?: { id: string };
  parent?: ParentAgentContext;
}

export declare class TemplateRuntimeService {
  renderContextResource(
    resource: ContextResourceTemplateConfig,
    params: RenderContextResourceParams
  ): Promise<string>;
}

export declare const templateRuntimeProviders: Provider[];
