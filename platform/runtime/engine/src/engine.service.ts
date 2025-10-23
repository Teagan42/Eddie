import { Injectable, Optional } from "@nestjs/common";
import { Buffer } from "buffer";
import { randomUUID } from "crypto";
import path from "path";
import type {
  AgentDefinition,
  AgentProviderConfig,
  AgentRuntimeCatalog,
  AgentRuntimeDescriptor,
  CliRuntimeOptions,
  ContextConfig,
  EddieConfig,
  HookDispatchResult,
  HookEventName,
  ProviderConfig,
  SessionMetadata,
  SessionStatus,
} from "@eddie/types";
import { ConfigStore } from "@eddie/config";
import { ContextService } from "@eddie/context";
import { ProviderFactoryService } from "@eddie/providers";
import { builtinTools } from "@eddie/tools";
import { ConfirmService, LoggerService } from "@eddie/io";
import { HooksService } from "@eddie/hooks";
import type { HookBus } from "@eddie/hooks";

import {
  composeResourceText,
  HOOK_EVENTS,
  type ChatMessage,
  type PackedContext,
  type PackedResource,
  type ProviderAdapter,
  type ToolDefinition,
} from "@eddie/types";
import { TokenizerService } from "@eddie/tokenizers";
import {
  AgentOrchestratorService,
  type AgentRuntimeOptions,
} from "./agents/agent-orchestrator.service";
import type { AgentInvocation } from "./agents/agent-invocation";
import type { Logger } from "pino";
import { McpToolSourceService } from "@eddie/mcp";
import type { DiscoveredMcpResource } from "@eddie/mcp";
import { TranscriptCompactionService } from "./transcript/transcript-compaction.service";
import { MetricsService } from "./telemetry/metrics.service";
import { DemoSeedReplayService } from "./demo/demo-seed-replay.service";
import { MemoryFacade } from "@eddie/memory";
import type { AgentMemoryRuntime, AgentMemoryAdapter } from "./agents/memory.types";

export interface EngineOptions extends CliRuntimeOptions {
    history?: ChatMessage[];
    autoApprove?: boolean;
    nonInteractive?: boolean;
    sessionId?: string;
    promptRole?: ChatMessage["role"];
}

export interface EngineResult {
    messages: ChatMessage[];
    context: PackedContext;
    tracePath?: string;
    agents: AgentInvocation[];
}

/**
 * EngineService orchestrates the full CLI execution flow by layering configuration,
 * preparing context, invoking the selected provider, and coordinating tool usage
 * and trace emission.
 */
@Injectable()
export class EngineService {
  constructor(
        private readonly configStore: ConfigStore,
        private readonly contextService: ContextService,
        private readonly providerFactory: ProviderFactoryService,
        private readonly hooksService: HooksService,
        private readonly confirmService: ConfirmService,
        private readonly tokenizerService: TokenizerService,
        private readonly loggerService: LoggerService,
        private readonly transcriptCompactionService: TranscriptCompactionService,
        private readonly agentOrchestrator: AgentOrchestratorService,
        private readonly mcpToolSourceService: McpToolSourceService,
        private readonly metrics: MetricsService,
        @Optional()
        private readonly demoSeedReplayService?: DemoSeedReplayService,
        @Optional()
        private readonly memoryFacade?: MemoryFacade
  ) {}

  /**
     * Executes a single CLI run, emitting hooks in the order
     * `sessionStart` → `beforeContextPack` → `afterContextPack` →
     * `userPromptSubmit` before delegating to the agent orchestrator. Once the
     * agent tree finishes, a terminal `sessionEnd` hook is dispatched with the
     * aggregated result or failure context.
     */
  async run(prompt: string, options: EngineOptions = {}): Promise<EngineResult> {
    const promptRole = options.promptRole ?? "user";
    const resolvedOptions: EngineOptions = { ...options, promptRole };
    const runStartedAt = Date.now();
    const sessionId = resolvedOptions.sessionId ?? randomUUID();
    let hooks: HookBus | undefined;
    let session: SessionMetadata | undefined;
    let result: EngineResult | undefined;
    let failure: unknown;
    let logger!: Logger;

    this.metrics.countMessage(promptRole);

    try {
      const cfg = await this.resolveRuntimeConfig(resolvedOptions);
      const projectDir = cfg.projectDir ?? process.cwd();
      if (!cfg.context.baseDir) {
        cfg.context.baseDir = projectDir;
      }
      const managerRuntimeConfig = this.resolveAgentProviderConfig(
        cfg,
        cfg.agents?.manager?.provider,
        cfg.agents?.manager?.model
      );
      this.loggerService.configure({
        level: cfg.logging?.level ?? cfg.logLevel,
        destination: cfg.logging?.destination,
        enableTimestamps: cfg.logging?.enableTimestamps,
      });
      logger = this.loggerService.getLogger("engine");
      hooks = await this.hooksService.load(cfg.hooks);

      const tracePath = this.resolveTracePath(
        cfg.output?.jsonlTrace,
        sessionId,
        runStartedAt,
        projectDir
      );

      session = {
        id: sessionId,
        startedAt: new Date(runStartedAt).toISOString(),
        prompt,
        provider: managerRuntimeConfig.providerConfig.name,
        model: managerRuntimeConfig.model,
        tracePath,
      };

      const sessionStart = await hooks.emitAsync(HOOK_EVENTS.sessionStart, {
        metadata: session,
        config: cfg,
        options: resolvedOptions,
      });
      this.handleHookDispatchResult(
        HOOK_EVENTS.sessionStart,
        sessionStart,
        logger,
        {
          allowBlock: true,
        }
      );

      const beforeContextPack = await hooks.emitAsync(
        HOOK_EVENTS.beforeContextPack,
        {
          config: cfg,
          options: resolvedOptions,
        }
      );
      this.handleHookDispatchResult(
        HOOK_EVENTS.beforeContextPack,
        beforeContextPack,
        logger,
        { allowBlock: true }
      );
      const context = await this.contextService.pack(cfg.context);
      const {
        tools: remoteTools,
        resources: discoveredResources,
        prompts: discoveredPrompts,
      } = await this.mcpToolSourceService.collectTools(cfg.tools?.sources);

      void discoveredPrompts;

      if (discoveredResources.length > 0) {
        this.applyMcpResourcesToContext(
          context,
          cfg.context,
          discoveredResources,
          logger
        );
      }

      const afterContextPack = await hooks.emitAsync(
        HOOK_EVENTS.afterContextPack,
        {
          context,
        }
      );
      this.handleHookDispatchResult(
        HOOK_EVENTS.afterContextPack,
        afterContextPack,
        logger,
        {
          allowBlock: true,
        }
      );

      const tokenizer = this.tokenizerService.create(
        cfg.tokenizer?.provider ?? cfg.provider.name
      );
      const contextTokens = tokenizer.countTokens(context.text);
      logger.debug({ contextTokens }, "Packed context");

      const toolsEnabled = this.filterTools(
        [ ...builtinTools, ...remoteTools ],
        cfg.tools?.enabled,
        cfg.tools?.disabled
      );
      const catalog = this.buildAgentCatalog(cfg, toolsEnabled, context);
      const managerDescriptor = catalog.getManager();
      const confirm = this.confirmService.create({
        autoApprove: resolvedOptions.autoApprove ?? cfg.tools?.autoApprove,
        nonInteractive: resolvedOptions.nonInteractive ?? false,
      });
      const transcriptCompaction = this.transcriptCompactionService.createSelector(
        cfg,
      );

      const runtimeCwd = projectDir;

      const runtime: AgentRuntimeOptions = {
        catalog,
        hooks,
        confirm,
        cwd: runtimeCwd,
        logger,
        tracePath,
        traceAppend: cfg.output?.jsonlAppend ?? true,
        transcriptCompaction,
        metrics: this.metrics,
        contextMaxBytes: cfg.context?.maxBytes,
      };
      // Attach sessionId so trace writes include it
      runtime.sessionId = sessionId;

      const memoryRuntime = session
        ? this.createMemoryRuntime(cfg, session)
        : undefined;
      if (memoryRuntime) {
        runtime.memory = memoryRuntime;
      }

      const userPromptSubmit = await hooks.emitAsync(
        HOOK_EVENTS.userPromptSubmit,
        {
          metadata: session,
          prompt,
          historyLength: resolvedOptions.history?.length ?? 0,
          options: resolvedOptions,
        }
      );
      this.handleHookDispatchResult(
        HOOK_EVENTS.userPromptSubmit,
        userPromptSubmit,
        logger,
        {
          allowBlock: true,
        }
      );

      let demoReplay:
        | Awaited<ReturnType<DemoSeedReplayService["replayIfEnabled"]>>
        | undefined;

      if (this.demoSeedReplayService) {
        demoReplay = await this.demoSeedReplayService.replayIfEnabled({
          config: cfg,
          prompt,
          projectDir,
          tracePath,
          logger,
        });
      }

      if (demoReplay) {
        for (let index = 0; index < demoReplay.assistantMessages; index += 1) {
          this.metrics.countMessage("assistant");
        }

        result = {
          messages: demoReplay.messages,
          context,
          tracePath: demoReplay.tracePath,
          agents: [],
        };

        return result;
      }

      const rootInvocation = await this.metrics.timeOperation(
        "template.render",
        () =>
          this.agentOrchestrator.runAgent(
            {
              definition: managerDescriptor.definition,
              prompt,
              context,
              history: resolvedOptions.history,
              promptRole,
            },
            runtime
          )
      );

      const agents = this.agentOrchestrator.collectInvocations(rootInvocation);

      result = {
        messages: rootInvocation.messages,
        context,
        tracePath,
        agents,
      };

      return result;
    } catch (error) {
      failure = error;
      this.metrics.countError("engine.run");
      throw error;
    } finally {
      if (hooks && session) {
        const status: SessionStatus = failure ? "error" : "success";
        const sessionEnd = await hooks.emitAsync(HOOK_EVENTS.sessionEnd, {
          metadata: session,
          status,
          durationMs: Date.now() - runStartedAt,
          result: result
            ? {
              messageCount: result.messages.length,
              agentCount: result.agents.length,
              contextBytes: result.context.totalBytes,
            }
            : undefined,
          error: failure ? this.serializeError(failure) : undefined,
        });
        this.handleHookDispatchResult(
          HOOK_EVENTS.sessionEnd,
          sessionEnd,
          logger
        );
      }
    }
  }

  private async resolveRuntimeConfig(
    options: EngineOptions
  ): Promise<EddieConfig> {
    void options;
    return this.configStore.getSnapshot();
  }

  private applyMcpResourcesToContext(
    context: PackedContext,
    contextConfig: ContextConfig | undefined,
    discoveredResources: DiscoveredMcpResource[],
    logger: Logger
  ): void {
    const packedResources = discoveredResources.map((resource) =>
      this.toPackedResource(resource)
    );

    if (packedResources.length === 0) {
      return;
    }

    const maxBytes = contextConfig?.maxBytes;
    let remainingBytes =
      typeof maxBytes === "number"
        ? Math.max(maxBytes - context.totalBytes, 0)
        : undefined;

    const acceptedResources: PackedResource[] = [];
    const acceptedSections: string[] = [];
    let additionalBytes = 0;

    for (const resource of packedResources) {
      const resourceBytes = Buffer.byteLength(resource.text, "utf-8");

      if (remainingBytes !== undefined) {
        if (resourceBytes > remainingBytes) {
          logger.debug(
            {
              resource: resource.id,
              resourceBytes,
              remainingBytes,
              maxBytes,
            },
            "Skipping MCP resource exceeding maxBytes"
          );
          continue;
        }

        remainingBytes -= resourceBytes;
      }

      acceptedResources.push(resource);

      const section = composeResourceText(resource);
      if (section.trim().length > 0) {
        acceptedSections.push(section);
      }

      additionalBytes += resourceBytes;
    }

    if (acceptedResources.length === 0) {
      return;
    }

    context.resources = [
      ...(context.resources ?? []),
      ...acceptedResources,
    ];

    if (acceptedSections.length > 0) {
      const baseSections =
        context.text && context.text.trim().length > 0 ? [ context.text ] : [];
      context.text = [ ...baseSections, ...acceptedSections ].join("\n\n");
    }

    context.totalBytes += additionalBytes;
  }

  private toPackedResource(resource: DiscoveredMcpResource): PackedResource {
    const label = resource.name ?? resource.uri;
    const idBase = label ?? resource.uri;
    const normalizedId = `mcp:${ resource.sourceId }:${ idBase }`
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9:_-]/g, "_");

    const metadata: Record<string, unknown> = {
      sourceId: resource.sourceId,
      uri: resource.uri,
    };

    if (resource.mimeType) {
      metadata.mimeType = resource.mimeType;
    }

    if (resource.metadata && Object.keys(resource.metadata).length > 0) {
      metadata.attributes = structuredClone(resource.metadata);
    }

    const details: string[] = [ `URI: ${ resource.uri }` ];
    if (resource.mimeType) {
      details.push(`MIME: ${ resource.mimeType }`);
    }
    if (resource.metadata && Object.keys(resource.metadata).length > 0) {
      details.push(
        `Metadata: ${ JSON.stringify(resource.metadata, null, 2) }`
      );
    }

    return {
      id: normalizedId,
      type: "template",
      name: label,
      description: resource.description,
      text: details.join("\n"),
      metadata,
    };
  }

  private buildAgentCatalog(
    cfg: EddieConfig,
    tools: ToolDefinition[],
    context: PackedContext
  ): AgentRuntimeCatalog {
    const cloneAllowed = (
      allowed?: string[]
    ): readonly string[] | undefined =>
      typeof allowed !== "undefined" ? [...allowed] : undefined;

    const adapterCache = new Map<string, ProviderAdapter>();
    const getAdapter = (config: ProviderConfig): ProviderAdapter => {
      const key = JSON.stringify(config);
      const cached = adapterCache.get(key);
      if (cached) {
        return cached;
      }

      const adapter = this.providerFactory.create(config);
      adapterCache.set(key, adapter);
      return adapter;
    };

    const managerConfig = cfg.agents?.manager;
    const managerInfo = this.resolveAgentProviderConfig(
      cfg,
      managerConfig?.provider,
      managerConfig?.model
    );
    const managerAdapter = getAdapter(managerInfo.providerConfig);

    const managerDefinition: AgentDefinition = {
      id: "manager",
      systemPrompt: managerConfig?.prompt ?? cfg.systemPrompt,
      systemPromptTemplate: managerConfig?.promptTemplate,
      userPromptTemplate: managerConfig?.defaultUserPromptTemplate,
      variables: managerConfig?.variables,
      tools,
      context,
    };

    const managerMetadataEntries: Record<string, unknown> = {};
    if (managerInfo.profileId) {
      managerMetadataEntries.profileId = managerInfo.profileId;
    }
    if (typeof managerConfig?.allowedSubagents !== "undefined") {
      managerMetadataEntries.allowedSubagents = [
        ...managerConfig.allowedSubagents,
      ];
    }
    if (managerConfig?.memory) {
      managerMetadataEntries.memory = this.cloneMemoryConfig(
        managerConfig.memory
      );
    }

    const managerMetadata =
      Object.keys(managerMetadataEntries).length > 0
        ? (managerMetadataEntries as AgentRuntimeDescriptor["metadata"])
        : undefined;

    const managerDescriptor: AgentRuntimeDescriptor = {
      id: "manager",
      definition: managerDefinition,
      model: managerInfo.model,
      provider: managerAdapter,
      metadata: managerMetadata,
    };

    const subagentMap = new Map<string, AgentRuntimeDescriptor>();
    const spawnRules = new Map<string, readonly string[] | undefined>();

    spawnRules.set("manager", cloneAllowed(managerConfig?.allowedSubagents));

    for (const subagent of cfg.agents.subagents) {
      const runtimeInfo = this.resolveAgentProviderConfig(
        cfg,
        subagent.provider,
        subagent.model
      );
      const adapter = getAdapter(runtimeInfo.providerConfig);

      const allowedTools =
                subagent.tools && subagent.tools.length > 0
                  ? this.filterTools(tools, subagent.tools, undefined)
                  : tools;

      const definition: AgentDefinition = {
        id: subagent.id,
        systemPrompt: subagent.prompt ?? cfg.systemPrompt,
        systemPromptTemplate: subagent.promptTemplate,
        userPromptTemplate: subagent.defaultUserPromptTemplate,
        variables: subagent.variables,
        tools: allowedTools,
        context,
      };

      const metadataEntries: Record<string, unknown> = {};
      if (subagent.name) {
        metadataEntries.name = subagent.name;
      }
      if (subagent.description) {
        metadataEntries.description = subagent.description;
      }
      if (typeof subagent.routingThreshold === "number") {
        metadataEntries.routingThreshold = subagent.routingThreshold;
      }
      if (runtimeInfo.profileId) {
        metadataEntries.profileId = runtimeInfo.profileId;
      }
      if (typeof subagent.allowedSubagents !== "undefined") {
        metadataEntries.allowedSubagents = [...subagent.allowedSubagents];
      }
      if (subagent.memory) {
        metadataEntries.memory = this.cloneMemoryConfig(subagent.memory);
      }

      const descriptor: AgentRuntimeDescriptor = {
        id: subagent.id,
        definition,
        model: runtimeInfo.model,
        provider: adapter,
        metadata:
                    Object.keys(metadataEntries).length > 0
                      ? (metadataEntries as AgentRuntimeDescriptor[ "metadata" ])
                      : undefined,
      };

      subagentMap.set(subagent.id, descriptor);
      spawnRules.set(subagent.id, cloneAllowed(subagent.allowedSubagents));
    }

    return new DefaultAgentRuntimeCatalog(
      managerDescriptor,
      subagentMap,
      cfg.agents.enableSubagents,
      spawnRules
    );
  }

  private createMemoryRuntime(
    cfg: EddieConfig,
    session: SessionMetadata
  ): AgentMemoryRuntime | undefined {
    if (!this.memoryFacade || cfg.memory?.enabled !== true) {
      return undefined;
    }

    const adapter: AgentMemoryAdapter = {
      recallMemories: async (request) => {
        const sessionId = request.session?.id ?? session.id;
        return this.memoryFacade!.recallMemories({
          query: request.query,
          agentId: request.agent.id,
          sessionId,
          metadata: request.metadata,
        });
      },
    };

    return {
      adapter,
      session,
    };
  }

  private resolveAgentProviderConfig(
    cfg: EddieConfig,
    spec: AgentProviderConfig | undefined,
    modelOverride?: string
  ): { providerConfig: ProviderConfig; model: string; profileId?: string; } {
    let providerConfig = this.cloneProviderConfig(cfg.provider);
    let profileModel: string | undefined;
    let profileId: string | undefined;

    if (typeof spec === "string") {
      const profile = cfg.providers?.[ spec ];
      if (profile) {
        providerConfig = this.cloneProviderConfig(profile.provider);
        profileModel = profile.model;
        profileId = spec;
      } else {
        providerConfig = {
          ...providerConfig,
          name: spec,
        };
      }
    } else if (spec && typeof spec === "object") {
      providerConfig = {
        ...providerConfig,
        ...spec,
      } as ProviderConfig;
    }

    if (
      typeof providerConfig.name !== "string" ||
            providerConfig.name.trim() === ""
    ) {
      providerConfig.name = cfg.provider.name;
    }

    const model = modelOverride ?? profileModel ?? cfg.model;

    return { providerConfig, model, profileId };
  }

  private cloneProviderConfig(config: ProviderConfig): ProviderConfig {
    return JSON.parse(JSON.stringify(config)) as ProviderConfig;
  }

  private cloneMemoryConfig<T>(config: T | undefined): T | undefined {
    if (!config) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(config)) as T;
  }

  private filterTools(
    available: ToolDefinition[],
    enabled?: string[],
    disabled?: string[]
  ): ToolDefinition[] {
    const enabledSet = enabled?.length ? new Set(enabled) : undefined;
    const disabledSet = disabled?.length
      ? new Set(disabled)
      : new Set<string>();

    return available.filter((tool) => {
      if (disabledSet.has(tool.name)) return false;
      if (enabledSet) return enabledSet.has(tool.name);
      return true;
    });
  }

  private resolveTracePath(
    configuredPath: string | undefined,
    sessionId: string,
    runStartedAt: number,
    projectDir: string
  ): string | undefined {
    if (!configuredPath) {
      return undefined;
    }

    const resolved = path.resolve(
      this.resolveTraceBaseDir(projectDir),
      configuredPath
    );
    const hasJsonlExtension =
      path.extname(resolved).toLowerCase() === ".jsonl";
    const directory = hasJsonlExtension
      ? path.dirname(resolved)
      : resolved;

    const timestamp = new Date(runStartedAt)
      .toISOString()
      .replace(/:/g, "-");

    return path.join(directory, `${timestamp}_${sessionId}.jsonl`);
  }

  private resolveTraceBaseDir(projectDir: string): string {
    const trimmed = projectDir.trim();
    return trimmed.length > 0 ? trimmed : process.cwd();
  }

  private serializeError(error: unknown): {
        message: string;
        stack?: string;
        cause?: unknown;
    } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        cause: (error as { cause?: unknown; }).cause,
      };
    }

    return { message: String(error) };
  }

  private handleHookDispatchResult<K extends HookEventName>(
    event: K,
    dispatch: HookDispatchResult<K>,
    logger: Logger,
    options: { allowBlock?: boolean; } = {}
  ): void {
    if (dispatch.error) {
      const cause = dispatch.error;
      if (cause instanceof Error) {
        logger.error({ err: cause, event }, `Hook "${ event }" failed`);
      } else {
        logger.error({ event, error: cause }, `Hook "${ event }" failed`);
      }

      const message =
                cause instanceof Error
                  ? `Hook "${ event }" failed: ${ cause.message }`
                  : `Hook "${ event }" failed: ${ String(cause) }`;

      throw new Error(message, { cause });
    }

    if (options.allowBlock && dispatch.blocked) {
      const reason =
                dispatch.blocked.reason ?? `Hook "${ event }" blocked execution.`;
      logger.warn({ event, reason }, `Hook "${ event }" blocked execution`);
      throw new Error(reason, { cause: dispatch.blocked });
    }
  }
}

class DefaultAgentRuntimeCatalog implements AgentRuntimeCatalog {
  constructor(
        private readonly manager: AgentRuntimeDescriptor,
        private readonly subagents: Map<string, AgentRuntimeDescriptor>,
        readonly enableSubagents: boolean,
        private readonly spawnRules: Map<string, readonly string[] | undefined>
  ) { }

  getManager(): AgentRuntimeDescriptor {
    return this.manager;
  }

  getAgent(id: string): AgentRuntimeDescriptor | undefined {
    if (id === this.manager.id) {
      return this.manager;
    }

    return this.subagents.get(id);
  }

  getSubagent(id: string): AgentRuntimeDescriptor | undefined {
    return this.subagents.get(id);
  }

  listSubagents(): AgentRuntimeDescriptor[] {
    return Array.from(this.subagents.values());
  }

  listSpawnableSubagents(agentId: string): AgentRuntimeDescriptor[] {
    const allowed = this.spawnRules.get(agentId);
    if (typeof allowed === "undefined") {
      return this.listSubagents();
    }

    if (allowed.length === 0) {
      return [];
    }

    const results: AgentRuntimeDescriptor[] = [];
    for (const subagentId of allowed) {
      const descriptor = this.subagents.get(subagentId);
      if (descriptor) {
        results.push(descriptor);
      }
    }

    return results;
  }
}
