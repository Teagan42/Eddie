import { Injectable } from "@nestjs/common";
import path from "path";
import type { CliRuntimeOptions } from "../../config/types";
import { ConfigService } from "../../config";
import { ContextService } from "../context/context.service";
import { ProviderFactory } from "../providers/provider-factory.service";
import { ToolRegistryFactory, builtinTools } from "../tools";
import {
  ConfirmService,
  JsonlWriterService,
  LoggerService,
  StreamRendererService,
} from "../../io";
import { HooksService } from "../../hooks";
import type { ChatMessage, StreamEvent } from "../types";
import type { PackedContext } from "../types";
import { TokenizerService } from "../tokenizers";

export interface EngineOptions extends CliRuntimeOptions {
  history?: ChatMessage[];
  autoApprove?: boolean;
  nonInteractive?: boolean;
}

export interface EngineResult {
  messages: ChatMessage[];
  context: PackedContext;
  tracePath?: string;
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
    private readonly providerFactory: ProviderFactory,
    private readonly toolRegistryFactory: ToolRegistryFactory,
    private readonly streamRenderer: StreamRendererService,
    private readonly traceWriter: JsonlWriterService,
    private readonly hooksService: HooksService,
    private readonly confirmService: ConfirmService,
    private readonly tokenizerService: TokenizerService,
    private readonly loggerService: LoggerService
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
    const registry = this.toolRegistryFactory.create(toolsEnabled);
    const toolSchemas =
      toolsEnabled.length > 0 ? registry.schemas() : undefined;

    const confirm = this.confirmService.create({
      autoApprove: options.autoApprove ?? cfg.tools?.autoApprove,
      nonInteractive: options.nonInteractive ?? false,
    });

    const tracePath = cfg.output?.jsonlTrace
      ? path.resolve(cfg.output.jsonlTrace)
      : undefined;

    if (tracePath) {
      await this.traceWriter.write(
        tracePath,
        {
          type: "start",
          model: cfg.model,
          provider: provider.name,
          prompt,
          timestamp: new Date().toISOString(),
        },
        cfg.output?.jsonlAppend ?? true
      );
    }

    const messages = this.buildInitialMessages(
      prompt,
      context,
      cfg.systemPrompt,
      options.history
    );

    let iteration = 0;
    let continueConversation = true;

    while (continueConversation) {
      iteration += 1;
      continueConversation = false;

      await hooks.emitAsync("beforeModelCall", { iteration, messages });

      const stream = provider.stream({
        model: cfg.model,
        messages,
        tool_choice: cfg.tools?.defaultTool,
        tool_namespaces: cfg.tools?.namespaces,
        tool_schemas: toolSchemas,
      });

      let assistantBuffer = "";

      for await (const event of stream) {
        if (event.type === "delta") {
          assistantBuffer += event.value;
          this.streamRenderer.render(event.value);
          continue;
        }

        if (event.type === "tool_call") {
          this.streamRenderer.flush();
          await hooks.emitAsync("onToolCall", { event, iteration });

          messages.push({
            role: "assistant",
            content: "",
            name: event.name,
            tool_call_id: event.id,
          });

          try {
            const result = await registry.execute(event, {
              cwd: cfg.context.baseDir ?? process.cwd(),
              confirm,
              env: process.env,
            });

            messages.push({
              role: "tool",
              name: event.name,
              tool_call_id: event.id,
              content: result.content,
            });

            await hooks.emitAsync("onToolResult", {
              event,
              result,
            });

            await this.logTrace(tracePath, {
              type: "tool_result",
              name: event.name,
              id: event.id,
              result: result.content,
            });

            continueConversation = true;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(
              { err: message, tool: event.name },
              "Tool execution failed"
            );
            messages.push({
              role: "tool",
              name: event.name,
              tool_call_id: event.id,
              content: `Tool execution failed: ${message}`,
            });
          }

          continue;
        }

        if (event.type === "error") {
          await hooks.emitAsync("onError", event);
          continueConversation = false;
        }

        if (event.type === "end") {
          if (assistantBuffer.trim().length > 0) {
            messages.push({ role: "assistant", content: assistantBuffer });
          }
          await hooks.emitAsync("onComplete", { messages, iteration });
        }
      }
    }

    if (tracePath) {
      await this.traceWriter.write(tracePath, {
        type: "end",
        timestamp: new Date().toISOString(),
      });
    }

    return {
      messages,
      context,
      tracePath,
    };
  }

  private buildInitialMessages(
    prompt: string,
    context: PackedContext,
    systemPrompt: string,
    history?: ChatMessage[]
  ): ChatMessage[] {
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(history ?? []),
    ];

    const withContext =
      context.text.trim().length > 0
        ? `${prompt}\n\n<workspace_context>\n${context.text}\n</workspace_context>`
        : prompt;

    messages.push({ role: "user", content: withContext });
    return messages;
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

  private async logTrace(
    tracePath: string | undefined,
    event: StreamEvent,
    append = true
  ): Promise<void> {
    if (!tracePath) return;
    await this.traceWriter.write(
      tracePath,
      { ...event, timestamp: new Date().toISOString() },
      append
    );
  }
}
