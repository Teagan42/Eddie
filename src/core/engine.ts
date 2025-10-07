import path from "path";
import type { CliRuntimeOptions } from "../config/types";
import { loadConfig } from "../config/loader";
import { packContext } from "./context/packer";
import { makeProvider } from "./providers";
import { ToolRegistry } from "./tools/registry";
import { builtinTools } from "./tools/builtin";
import { streamRender } from "../io/stream_renderer";
import { writeJSONL } from "../io/jsonl_writer";
import { loadHooks } from "../hooks/loader";
import type { ChatMessage, StreamEvent } from "./types";
import type { PackedContext } from "./types";
import { createConfirm } from "../io/confirm";
import { makeTokenizer } from "./tokenizers/strategy";
import { getLogger, initLogging } from "../io/logger";

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

function buildInitialMessages(
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

function filterTools(enabled?: string[], disabled?: string[]) {
  const enabledSet = enabled?.length ? new Set(enabled) : undefined;
  const disabledSet = disabled?.length ? new Set(disabled) : new Set<string>();

  return builtinTools.filter((tool) => {
    if (disabledSet.has(tool.name)) return false;
    if (enabledSet) return enabledSet.has(tool.name);
    return true;
  });
}

async function logTrace(
  tracePath: string | undefined,
  event: StreamEvent,
  append = true
): Promise<void> {
  if (!tracePath) return;
  await writeJSONL(tracePath, { ...event, timestamp: new Date().toISOString() }, append);
}

export async function runEngine(
  prompt: string,
  options: EngineOptions = {}
): Promise<EngineResult> {
  const cfg = await loadConfig(options);
  initLogging({
    level: cfg.logging?.level ?? cfg.logLevel,
    destination: cfg.logging?.destination,
    enableTimestamps: cfg.logging?.enableTimestamps,
  });
  const logger = getLogger("engine");
  const hooks = await loadHooks(cfg.hooks);

  await hooks.emitAsync("beforeContextPack", { config: cfg, options });
  const context = await packContext(cfg.context);
  await hooks.emitAsync("afterContextPack", { context });

  const tokenizer = makeTokenizer(cfg.tokenizer?.provider ?? cfg.provider.name);
  const contextTokens = tokenizer.countTokens(context.text);
  logger.debug({ contextTokens }, "Packed context");

  const provider = makeProvider(cfg.provider);

  const toolsEnabled = filterTools(
    cfg.tools?.enabled,
    cfg.tools?.disabled
  );
  const registry = new ToolRegistry(toolsEnabled);
  const toolSchemas =
    toolsEnabled.length > 0 ? registry.schemas() : undefined;

  const confirm = createConfirm({
    autoApprove: options.autoApprove ?? cfg.tools?.autoApprove,
    nonInteractive: options.nonInteractive ?? false,
  });

  const tracePath = cfg.output?.jsonlTrace
    ? path.resolve(cfg.output.jsonlTrace)
    : undefined;

  if (tracePath) {
    await writeJSONL(
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

  const messages = buildInitialMessages(
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
      tools: toolSchemas,
    });

    // Track assistant delta text to append final message
    let assistantBuffer = "";

    for await (const event of stream) {
      await logTrace(tracePath, event);

      streamRender(event);

      if (event.type === "delta") {
        assistantBuffer += event.text;
        continue;
      }

      if (event.type === "tool_call") {
        await hooks.emitAsync("onToolCall", event);

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

          await logTrace(tracePath, {
            type: "tool_result",
            name: event.name,
            id: event.id,
            result: result.content,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error({ err: message, tool: event.name }, "Tool execution failed");
          messages.push({
            role: "tool",
            name: event.name,
            tool_call_id: event.id,
            content: `Tool execution failed: ${message}`,
          });
        }

        continueConversation = true;
        break;
      }

      if (event.type === "error") {
        logger.error({ event }, "Provider reported error");
        await hooks.emitAsync("onError", event);
        continueConversation = false;
        break;
      }

      if (event.type === "end") {
        continueConversation = false;
        break;
      }
    }

    if (assistantBuffer.trim().length > 0) {
      messages.push({
        role: "assistant",
        content: assistantBuffer,
      });
      assistantBuffer = "";
    }

    await hooks.emitAsync("afterModelCall", { iteration, messages });
  }

  await hooks.emitAsync("onComplete", { messages });

  if (tracePath) {
    await writeJSONL(tracePath, { type: "end", timestamp: new Date().toISOString() });
  }

  return {
    messages,
    context,
    tracePath,
  };
}
