import { Injectable } from "@nestjs/common";
import { Buffer } from "buffer";
import { randomUUID } from "crypto";
import path from "path";
import type { CliRuntimeOptions } from "../../config/types";
import { ConfigService } from "../../config/config.service";
import { ContextService } from "../context/context.service";
import { ProviderFactoryService } from "../providers/provider-factory.service";
import { builtinTools } from "../tools/builtin/builtin-tools";
import { ConfirmService } from "../../io/confirm.service";
import { LoggerService } from "../../io/logger.service";
import { HooksService } from "../../hooks/hooks.service";
import { HOOK_EVENTS } from "../../hooks/types";
import type {
  HookBus,
  HookDispatchResult,
  HookEventName,
  SessionMetadata,
  SessionStatus,
} from "../../hooks/types";
import type { ChatMessage } from "../types";
import type { PackedContext, PackedResource, ToolDefinition } from "../types";
import { TokenizerService } from "../tokenizers/tokenizer.service";
import { AgentOrchestratorService } from "../agents/agent-orchestrator.service";
import type { AgentDefinition } from "../agents/agent-definition";
import type { AgentInvocation } from "../agents/agent-invocation";
import type { AgentRuntimeOptions } from "../agents/agent-orchestrator.service";
import type { Logger } from "pino";
import { McpToolSourceService } from "../../integrations/mcp/mcp-tool-source.service";
import type { DiscoveredMcpResource } from "../../integrations/mcp/types";

export interface EngineOptions extends CliRuntimeOptions {
  history?: ChatMessage[];
  autoApprove?: boolean;
  nonInteractive?: boolean;
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
    private readonly configService: ConfigService,
    private readonly contextService: ContextService,
    private readonly providerFactory: ProviderFactoryService,
    private readonly hooksService: HooksService,
    private readonly confirmService: ConfirmService,
    private readonly tokenizerService: TokenizerService,
    private readonly loggerService: LoggerService,
    private readonly agentOrchestrator: AgentOrchestratorService,
    private readonly mcpToolSourceService: McpToolSourceService
  ) {}

  /**
   * Executes a single CLI run, emitting hooks in the order
   * `sessionStart` → `beforeContextPack` → `afterContextPack` →
   * `userPromptSubmit` before delegating to the agent orchestrator. Once the
   * agent tree finishes, a terminal `sessionEnd` hook is dispatched with the
   * aggregated result or failure context.
   */
  async run(prompt: string, options: EngineOptions = {}): Promise<EngineResult> {
    const runStartedAt = Date.now();
    const sessionId = randomUUID();
    let hooks: HookBus | undefined;
    let session: SessionMetadata | undefined;
    let result: EngineResult | undefined;
    let failure: unknown;
    let logger!: Logger;

    try {
      const cfg = await this.configService.load(options);
      this.loggerService.configure({
        level: cfg.logging?.level ?? cfg.logLevel,
        destination: cfg.logging?.destination,
        enableTimestamps: cfg.logging?.enableTimestamps,
      });
      logger = this.loggerService.getLogger("engine");
      hooks = await this.hooksService.load(cfg.hooks);

      const tracePath = cfg.output?.jsonlTrace
        ? path.resolve(cfg.output.jsonlTrace)
        : undefined;

      session = {
        id: sessionId,
        startedAt: new Date(runStartedAt).toISOString(),
        prompt,
        provider: cfg.provider.name,
        model: cfg.model,
        tracePath,
      };

      const sessionStart = await hooks.emitAsync(HOOK_EVENTS.sessionStart, {
        metadata: session,
        config: cfg,
        options,
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
          options,
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
      } = await this.mcpToolSourceService.collectTools(cfg.tools?.sources);

      if (discoveredResources.length > 0) {
        this.applyMcpResourcesToContext(context, discoveredResources);
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

      const provider = this.providerFactory.create(cfg.provider);
      const toolsEnabled = this.filterTools(
        [...builtinTools, ...remoteTools],
        cfg.tools?.enabled,
        cfg.tools?.disabled
      );
      const confirm = this.confirmService.create({
        autoApprove: options.autoApprove ?? cfg.tools?.autoApprove,
        nonInteractive: options.nonInteractive ?? false,
      });

      const managerPrompt = cfg.agents?.manager?.prompt ?? cfg.systemPrompt;
      const agentDefinition: AgentDefinition = {
        id: "manager",
        systemPrompt: managerPrompt,
        systemPromptTemplate: cfg.agents?.manager?.promptTemplate,
        userPromptTemplate:
          cfg.agents?.manager?.defaultUserPromptTemplate,
        variables: cfg.agents?.manager?.variables,
        tools: toolsEnabled,
      };

      const runtime: AgentRuntimeOptions = {
        provider,
        model: cfg.model,
        hooks,
        confirm,
        cwd: cfg.context.baseDir ?? process.cwd(),
        logger,
        tracePath,
        traceAppend: cfg.output?.jsonlAppend ?? true,
      };

      const userPromptSubmit = await hooks.emitAsync(
        HOOK_EVENTS.userPromptSubmit,
        {
          metadata: session,
          prompt,
          historyLength: options.history?.length ?? 0,
          options,
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

      const rootInvocation = await this.agentOrchestrator.runAgent(
        {
          definition: agentDefinition,
          prompt,
          context,
          history: options.history,
        },
        runtime
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

  private applyMcpResourcesToContext(
    context: PackedContext,
    discoveredResources: DiscoveredMcpResource[]
  ): void {
    const packedResources = discoveredResources.map((resource) =>
      this.toPackedResource(resource)
    );

    if (packedResources.length === 0) {
      return;
    }

    context.resources = [...(context.resources ?? []), ...packedResources];

    const resourceSections = packedResources
      .map((resource) => this.composeResourceText(resource))
      .filter((section) => section.trim().length > 0);

    if (resourceSections.length > 0) {
      const baseSections =
        context.text && context.text.trim().length > 0 ? [context.text] : [];
      context.text = [...baseSections, ...resourceSections].join("\n\n");
    }

    const additionalBytes = packedResources.reduce(
      (total, resource) => total + Buffer.byteLength(resource.text, "utf-8"),
      0
    );
    context.totalBytes += additionalBytes;
  }

  private toPackedResource(resource: DiscoveredMcpResource): PackedResource {
    const label = resource.name ?? resource.uri;
    const idBase = label ?? resource.uri;
    const normalizedId = `mcp:${resource.sourceId}:${idBase}`
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

    const details: string[] = [`URI: ${resource.uri}`];
    if (resource.mimeType) {
      details.push(`MIME: ${resource.mimeType}`);
    }
    if (resource.metadata && Object.keys(resource.metadata).length > 0) {
      details.push(
        `Metadata: ${JSON.stringify(resource.metadata, null, 2)}`
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

  private composeResourceText(resource: PackedResource): string {
    const label = resource.name ?? resource.id;
    const description = resource.description ? ` - ${resource.description}` : "";
    const body = resource.text.trimEnd();
    const lines = [`// Resource: ${label}${description}`];

    if (body.length > 0) {
      lines.push(body);
    }

    lines.push(`// End Resource: ${label}`);
    return lines.join("\n");
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

  private serializeError(error: unknown): {
    message: string;
    stack?: string;
    cause?: unknown;
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        cause: (error as { cause?: unknown }).cause,
      };
    }

    return { message: String(error) };
  }

  private handleHookDispatchResult<K extends HookEventName>(
    event: K,
    dispatch: HookDispatchResult<K>,
    logger: Logger,
    options: { allowBlock?: boolean } = {}
  ): void {
    if (dispatch.error) {
      const cause = dispatch.error;
      if (cause instanceof Error) {
        logger.error({ err: cause, event }, `Hook "${event}" failed`);
      } else {
        logger.error({ event, error: cause }, `Hook "${event}" failed`);
      }

      const message =
        cause instanceof Error
          ? `Hook "${event}" failed: ${cause.message}`
          : `Hook "${event}" failed: ${String(cause)}`;

      throw new Error(message, { cause });
    }

    if (options.allowBlock && dispatch.blocked) {
      const reason =
        dispatch.blocked.reason ?? `Hook "${event}" blocked execution.`;
      logger.warn({ event, reason }, `Hook "${event}" blocked execution`);
      throw new Error(reason, { cause: dispatch.blocked });
    }
  }
}
