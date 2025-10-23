import { Injectable } from "@nestjs/common";
import { Buffer } from "buffer";
import type {
  AgentDefinition,
  AgentInvocationOptions,
  AgentInvocationMemoryUsage,
  AgentMemoryConfig,
  AgentRecalledMemory,
  AgentRuntimeDescriptor,
  ChatMessage,
  PackedContext,
} from "@eddie/types";
import { ToolRegistryFactory } from "@eddie/tools";
import { AgentInvocation } from "./agent-invocation";
import {
  TemplateRuntimeService,
  type ParentAgentContext,
} from "@eddie/templates";
import type { AgentRuntimeOptions } from "./agent-orchestrator.service";

export type MemoryRecallResult = {
  memories: AgentRecalledMemory[],
  usage: AgentInvocationMemoryUsage[],
  appendText?: string,
  appendBytes?: number,
};

const createEmptyRecallResult = (): MemoryRecallResult => ({
  memories: [],
  usage: [],
});

export const EMPTY_RECALL_RESULT: MemoryRecallResult = createEmptyRecallResult();

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
    runtime?: AgentRuntimeOptions,
    parent?: AgentInvocation
  ): Promise<AgentInvocation> {
    const sourceContext = options.context ?? definition.context ?? EMPTY_CONTEXT;
    const context = cloneContext(sourceContext);
    const history = cloneHistory(options.history ?? []);
    const descriptor = this.resolveDescriptor(runtime, definition);
    const { memories, usage, appendText, appendBytes } = await this.recallMemories(
      descriptor,
      options,
      runtime,
      context
    );
    if (appendText) {
      const baseBytes =
        typeof context.totalBytes === "number"
          ? context.totalBytes
          : Buffer.byteLength(context.text ?? "", "utf8");
      context.text = `${context.text ?? ""}${appendText}`;
      const additionalBytes = appendBytes ?? Buffer.byteLength(appendText, "utf8");
      context.totalBytes = baseBytes + additionalBytes;
    }
    const parentContext: ParentAgentContext | undefined = parent
      ? { id: parent.definition.id }
      : undefined;

    const system = await this.templateRuntime.renderSystemPrompt({
      definition,
      options,
      context,
      history,
      parent: parentContext,
      memories: memories.length > 0 ? memories : undefined,
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
      promptRole: options.promptRole,
    };

    const invocation = new AgentInvocation(
      resolvedDefinition,
      invocationOptions,
      this.toolRegistryFactory,
      parent
    );

    if (usage.length > 0) {
      invocation.setMemoryUsage(usage);
    }

    return invocation;
  }

  private async recallMemories(
    descriptor: AgentRuntimeDescriptor | undefined,
    options: AgentInvocationOptions,
    runtime: AgentRuntimeOptions | undefined,
    context: PackedContext
  ): Promise<MemoryRecallResult> {
    if (!runtime) {
      return this.emptyRecall();
    }

    if (!descriptor) {
      return this.emptyRecall();
    }

    const memoryConfig = descriptor.metadata?.memory;
    if (!memoryConfig?.recall) {
      return this.emptyRecall();
    }

    const memoryRuntime = runtime.memory;
    if (!memoryRuntime?.adapter) {
      return this.emptyRecall();
    }

    const query = options.prompt?.trim();
    if (!query) {
      return this.emptyRecall();
    }

    const budget = this.calculateMemoryBudget(runtime, context);
    if (budget === 0) {
      return this.emptyRecall();
    }

    const session = memoryRuntime.session;

    const metadata = this.composeMemoryRecallMetadata(
      memoryRuntime.metadata,
      memoryConfig,
    );

    const recalled = await memoryRuntime.adapter.recallMemories({
      agent: descriptor,
      query,
      session,
      metadata,
      maxBytes: budget,
    });

    if (!recalled?.length) {
      return this.emptyRecall();
    }

    const trimmed = this.trimMemoriesToBudget(recalled, budget, context);

    return trimmed;
  }

  private calculateMemoryBudget(
    runtime: AgentRuntimeOptions,
    context: PackedContext
  ): number | undefined {
    if (typeof runtime.contextMaxBytes !== "number") {
      return undefined;
    }

    return Math.max(runtime.contextMaxBytes - (context.totalBytes ?? 0), 0);
  }

  private trimMemoriesToBudget(
    memories: AgentRecalledMemory[],
    maxBytes: number | undefined,
    context: PackedContext
  ): MemoryRecallResult {
    const accepted: AgentRecalledMemory[] = [];
    const usage: AgentInvocationMemoryUsage[] = [];
    let appendText: string | undefined;
    let appendBytes = 0;

    if (typeof maxBytes !== "number") {
      for (const memory of memories) {
        const content = memory.memory ?? "";
        if (content.trim().length === 0) {
          continue;
        }
        accepted.push({ ...memory });
        const bytes = Buffer.byteLength(content, "utf8");
        usage.push({
          id: memory.id,
          facets: memory.facets,
          metadata: memory.metadata,
          bytes,
        });
      }
      if (accepted.length > 0) {
        const block = this.buildMemoryAppendBlock(context, accepted);
        if (block) {
          appendText = block.text;
          appendBytes = block.bytes;
        }
      }

      return appendText
        ? { memories: accepted, usage, appendText, appendBytes }
        : { memories: [], usage: [] };
    }

    for (const memory of memories) {
      const content = memory.memory ?? "";
      if (content.trim().length === 0) {
        continue;
      }
      accepted.push({ ...memory });
      const bytes = Buffer.byteLength(content, "utf8");
      usage.push({
        id: memory.id,
        facets: memory.facets,
        metadata: memory.metadata,
        bytes,
      });

      const candidateBlock = this.buildMemoryAppendBlock(context, accepted);
      if (!candidateBlock) {
        accepted.pop();
        usage.pop();
        continue;
      }
      const { text: candidateText, bytes: candidateBytes } = candidateBlock;

      if (candidateBytes > maxBytes) {
        accepted.pop();
        usage.pop();
        continue;
      }

      appendText = candidateText;
      appendBytes = candidateBytes;

      if (candidateBytes === maxBytes) {
        break;
      }
    }

    if (!appendText) {
      return { memories: [], usage: [] };
    }

    return { memories: accepted, usage, appendText, appendBytes };
  }

  private emptyRecall(): MemoryRecallResult {
    return createEmptyRecallResult();
  }

  private composeMemoryRecallMetadata(
    runtimeMetadata: Record<string, unknown> | undefined,
    memoryConfig: AgentMemoryConfig | undefined,
  ): Record<string, unknown> | undefined {
    const configFacets = memoryConfig?.facets;
    if (!runtimeMetadata && !configFacets) {
      return runtimeMetadata;
    }

    const metadata: Record<string, unknown> = {
      ...(runtimeMetadata ?? {}),
    };

    if (configFacets) {
      metadata.facets = structuredClone(configFacets);
    }

    return metadata;
  }

  private resolveDescriptor(
    runtime: AgentRuntimeOptions | undefined,
    definition: AgentDefinition,
  ): AgentRuntimeDescriptor | undefined {
    if (!runtime) {
      return undefined;
    }

    return (
      runtime.catalog.getAgent(definition.id) ?? runtime.catalog.getManager()
    );
  }

  private buildMemoryAppendBlock(
    context: PackedContext,
    memories: AgentRecalledMemory[],
  ): { text: string; bytes: number } | undefined {
    if (memories.length === 0) {
      return undefined;
    }

    const prefix = this.hasContextText(context) ? "\n\n" : "";
    const lines = memories
      .map((memory) => memory.memory ?? "")
      .filter((line) => line.length > 0)
      .join("\n");

    if (lines.length === 0) {
      return undefined;
    }

    const text = `${prefix}<recalled_memories>\n${lines}\n</recalled_memories>`;
    return { text, bytes: Buffer.byteLength(text, "utf8") };
  }

  private hasContextText(context: PackedContext): boolean {
    return !!context.text && context.text.trim().length > 0;
  }
}
