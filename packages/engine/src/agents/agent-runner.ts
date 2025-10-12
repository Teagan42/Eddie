import type { TemplateVariables } from "@eddie/templates";
import type { ChatMessage, PackedContext, ToolResult } from "@eddie/types";
import type { AgentInvocation } from "./agent-invocation";
import type { AgentRuntimeDescriptor } from "./agent-runtime.types";

export interface SubagentRequestDetails {
  prompt: string;
  variables?: TemplateVariables;
  context?: PackedContext;
  metadata?: Record<string, unknown>;
}

export interface BuildSubagentResultOptions {
  child: AgentInvocation;
  descriptor: AgentRuntimeDescriptor;
  parentDescriptor: AgentRuntimeDescriptor;
  request: SubagentRequestDetails;
}

type PackedContextSnapshot = PackedContext & { selectedBundleIds?: string[] };

interface SpawnResultData extends Record<string, unknown> {
  agentId: string;
  messageCount: number;
  prompt: string;
  finalMessage?: string;
  variables?: TemplateVariables;
  context: PackedContextSnapshot;
  requestContext?: PackedContextSnapshot;
  history?: ChatMessage[];
  transcriptSummary?: string;
  historySnippet?: string;
}

export class AgentRunner {
  static readonly SPAWN_TOOL_RESULT_SCHEMA = "eddie.tool.spawn_subagent.result.v1";

  static buildSubagentResult(
    options: BuildSubagentResultOptions
  ): ToolResult<SpawnResultData> {
    const { child, descriptor, parentDescriptor, request } = options;
    const finalMessage = child.messages.at(-1);
    const finalMessageText = finalMessage?.content?.trim() ?? "";
    const transcriptSummary = AgentRunner.createTranscriptSummary(child.messages);
    const selectedBundleIds = AgentRunner.collectSelectedBundleIds(child.context);

    const historyClone = AgentRunner.cloneHistory(child.history ?? []);
    const contextClone = AgentRunner.cloneContext(child.context);
    const requestContextClone = request.context
      ? AgentRunner.cloneContext(request.context)
      : undefined;

    if (selectedBundleIds.length > 0) {
      contextClone.selectedBundleIds = selectedBundleIds;
    }

    const variablesClone = request.variables && Object.keys(request.variables).length > 0
      ? { ...request.variables }
      : undefined;

    const content = finalMessageText.length > 0
      ? finalMessageText
      : `Subagent ${ descriptor.id } completed without a final response.`;

    const metadata: Record<string, unknown> = {
      agentId: descriptor.id,
      model: descriptor.model,
      provider: descriptor.provider.name,
      parentAgentId: parentDescriptor.id,
    };

    if (descriptor.metadata?.profileId) {
      metadata.profileId = descriptor.metadata.profileId;
    }
    if (descriptor.metadata?.routingThreshold !== undefined) {
      metadata.routingThreshold = descriptor.metadata.routingThreshold;
    }
    if (descriptor.metadata?.name) {
      metadata.name = descriptor.metadata.name;
    }
    if (descriptor.metadata?.description) {
      metadata.description = descriptor.metadata.description;
    }
    if (request.metadata && Object.keys(request.metadata).length > 0) {
      metadata.request = { ...request.metadata };
    }

    if (selectedBundleIds.length > 0) {
      metadata.contextBundleIds = selectedBundleIds;
    }

    if (transcriptSummary) {
      metadata.historySnippet = transcriptSummary;
      metadata.transcriptSummary = transcriptSummary;
    }

    if (finalMessageText.length > 0) {
      metadata.finalMessage = finalMessageText;
    }

    const data: SpawnResultData = {
      agentId: descriptor.id,
      messageCount: child.messages.length,
      prompt: request.prompt,
    };

    if (variablesClone) {
      data.variables = variablesClone;
    }

    if (finalMessageText.length > 0) {
      data.finalMessage = finalMessageText;
    }

    if (transcriptSummary) {
      data.transcriptSummary = transcriptSummary;
      data.historySnippet = transcriptSummary;
    }

    if (historyClone.length > 0) {
      data.history = historyClone;
    }

    data.context = contextClone;

    if (requestContextClone) {
      data.requestContext = requestContextClone;
    }

    return {
      schema: AgentRunner.SPAWN_TOOL_RESULT_SCHEMA,
      content,
      data,
      metadata,
    };
  }

  private static cloneContext(context: PackedContext): PackedContextSnapshot {
    return {
      ...context,
      files: context.files.map((file) => ({ ...file })),
      resources: context.resources?.map((resource) => ({
        ...resource,
        files: resource.files?.map((file) => ({ ...file })),
      })),
    };
  }

  private static cloneHistory(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((message) => ({ ...message }));
  }

  private static collectSelectedBundleIds(context: PackedContext): string[] {
    if (!context.resources || context.resources.length === 0) {
      return [];
    }

    return context.resources
      .filter((resource) => resource.type === "bundle")
      .map((resource) => resource.id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  }

  private static createTranscriptSummary(messages: ChatMessage[]): string | undefined {
    const relevant = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => {
        const trimmed = message.content.trim();
        if (!trimmed) {
          return undefined;
        }

        const role = message.role === "user" ? "User" : "Assistant";
        return `${ role }: ${ trimmed }`;
      })
      .filter((value): value is string => Boolean(value));

    if (relevant.length === 0) {
      return undefined;
    }

    const snippet = relevant.slice(-2).join(" | ");
    return snippet.length > 280 ? `${ snippet.slice(0, 277) }...` : snippet;
  }
}
