import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import path from "path";
import type { CliRuntimeOptions } from "../../config/types";
import { ConfigService } from "../../config";
import { ContextService } from "../context/context.service";
import { ProviderFactoryService } from "../providers/provider-factory.service";
import { builtinTools } from "../tools";
import { ConfirmService, LoggerService } from "../../io";
import { HOOK_EVENTS, HooksService } from "../../hooks";
import type {
  HookBus,
  HookDispatchResult,
  HookEventName,
  SessionMetadata,
  SessionStatus,
} from "../../hooks";
import type { ChatMessage } from "../types";
import type { PackedContext, ToolDefinition } from "../types";
import { TokenizerService } from "../tokenizers";
import {
  AgentOrchestratorService,
  type AgentDefinition,
  type AgentInvocation,
  type AgentRuntimeOptions,
} from "../agents";
import type { Logger } from "pino";
import { McpToolSourceService } from "../../integrations";

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

      const remoteTools = await this.mcpToolSourceService.collectTools(
        cfg.tools?.sources
      );
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
