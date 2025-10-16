import type {
  AgentDefinition,
  AgentInvocationOptions,
  AgentInvocationRuntimeDetails,
  AgentSpawnHandler,
  ChatMessage,
  PackedContext,
} from "@eddie/types";
import type { ToolRegistry } from "@eddie/tools";
import type { ToolRegistryFactory } from "@eddie/tools";

const EMPTY_CONTEXT: PackedContext = { files: [], totalBytes: 0, text: "" };

type AgentInvocationSpawnHandler = AgentSpawnHandler<AgentInvocation>;

export class AgentInvocation {
  readonly messages: ChatMessage[];
  readonly children: AgentInvocation[] = [];
  readonly context: PackedContext;
  readonly history: ChatMessage[];
  readonly prompt: string;
  readonly toolRegistry: ToolRegistry;
  private spawnHandler?: AgentInvocationSpawnHandler;
  private runtimeDetails?: AgentInvocationRuntimeDetails;

  constructor(
    readonly definition: AgentDefinition,
    options: AgentInvocationOptions,
    toolRegistryFactory: ToolRegistryFactory,
    readonly parent?: AgentInvocation
  ) {
    this.prompt = options.prompt;
    this.context = options.context ?? definition.context ?? EMPTY_CONTEXT;
    this.history = options.history ? [...options.history] : [];
    this.toolRegistry = toolRegistryFactory.create(definition.tools ?? []);
    this.messages = [
      { role: "system", content: definition.systemPrompt },
      ...this.history,
      { role: "user", content: this.composeUserContent(options.prompt) },
    ];
  }

  get id(): string {
    return this.definition.id;
  }

  get isRoot(): boolean {
    return !this.parent;
  }

  addChild(child: AgentInvocation): void {
    this.children.push(child);
  }

  setSpawnHandler(handler: AgentInvocationSpawnHandler): void {
    this.spawnHandler = handler;
  }

  setRuntime(details: AgentInvocationRuntimeDetails): void {
    this.runtimeDetails = details;
  }

  get runtime(): AgentInvocationRuntimeDetails | undefined {
    return this.runtimeDetails;
  }

  async spawn(
    definition: AgentDefinition,
    options: AgentInvocationOptions
  ): Promise<AgentInvocation> {
    if (!this.spawnHandler) {
      throw new Error("This agent cannot spawn subagents without an orchestrator binding.");
    }
    return this.spawnHandler(definition, options);
  }

  private composeUserContent(prompt: string): string {
    const contextText = this.context.text?.trim();
    if (contextText && contextText.length > 0) {
      return `${prompt}\n\n<workspace_context>\n${contextText}\n</workspace_context>`;
    }
    return prompt;
  }
}
