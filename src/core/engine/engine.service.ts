import { Injectable } from "@nestjs/common";
import path from "path";
import type { CliRuntimeOptions } from "../../config/types";
import { ConfigService } from "../../config";
import { ContextService } from "../context/context.service";
import { ProviderFactoryService } from "../providers/provider-factory.service";
import { builtinTools } from "../tools";
import { ConfirmService, LoggerService } from "../../io";
import { HooksService } from "../../hooks";
import type { ChatMessage } from "../types";
import type { PackedContext } from "../types";
import { TokenizerService } from "../tokenizers";
import {
  AgentOrchestratorService,
  type AgentDefinition,
  type AgentInvocation,
  type AgentRuntimeOptions,
} from "../agents";

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
    private readonly agentOrchestrator: AgentOrchestratorService
  ) {}

  async run(prompt: string, options: EngineOptions = {}): Promise<EngineResult> {
    const cfg = await this.configService.load(options);
    this.loggerService.configure({
      level: cfg.logging?.level ?? cfg.logLevel,
      destination: cfg.logging?.destination,
      enableTimestamps: cfg.logging?.enableTimestamps,
    });
    const logger = this.loggerService.getLogger("engine");
    const hooks = await this.hooksService.load(cfg.hooks);

    await hooks.emitAsync("beforeContextPack", { config: cfg, options });
    const context = await this.contextService.pack(cfg.context);
    await hooks.emitAsync("afterContextPack", { context });

    const tokenizer = this.tokenizerService.create(
      cfg.tokenizer?.provider ?? cfg.provider.name
    );
    const contextTokens = tokenizer.countTokens(context.text);
    logger.debug({ contextTokens }, "Packed context");

    const provider = this.providerFactory.create(cfg.provider);

    const toolsEnabled = this.filterTools(
      cfg.tools?.enabled,
      cfg.tools?.disabled
    );
    const confirm = this.confirmService.create({
      autoApprove: options.autoApprove ?? cfg.tools?.autoApprove,
      nonInteractive: options.nonInteractive ?? false,
    });

    const tracePath = cfg.output?.jsonlTrace
      ? path.resolve(cfg.output.jsonlTrace)
      : undefined;

    const agentDefinition: AgentDefinition = {
      id: "manager",
      systemPrompt: cfg.systemPrompt,
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

    return {
      messages: rootInvocation.messages,
      context,
      tracePath,
      agents,
    };
  }

  private filterTools(enabled?: string[], disabled?: string[]) {
    const enabledSet = enabled?.length ? new Set(enabled) : undefined;
    const disabledSet = disabled?.length
      ? new Set(disabled)
      : new Set<string>();

    return builtinTools.filter((tool) => {
      if (disabledSet.has(tool.name)) return false;
      if (enabledSet) return enabledSet.has(tool.name);
      return true;
    });
  }
}
