import { extname } from "node:path";

import { Injectable, Logger } from "@nestjs/common";
import type { LoggerService } from "@nestjs/common";
import { HookBus } from "./hook-bus.service";
import {
  HOOK_EVENTS,
  type HookEventHandlers,
  isHookEventName,
  type HookEventName,
  type HookListener,
} from "@eddie/types";
import {
  importESM,
  isESM,
  resolveCandidate,
  resolveEntry,
} from "./utils";


export type HookInstaller = (
  bus: HookBus,
  logger: LoggerService
) => void | Promise<void>;

export type HookModule = HookInstaller | HookEventHandlers;

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".cts"]);

let tsCompilerRegistered = false;

function registerTypeScriptCompiler(resolved: string): void {
  if (tsCompilerRegistered) {
    return;
  }

  const errors: Error[] = [];

  for (const moduleName of [
    "ts-node/register/transpile-only",
    "ts-node/register",
  ]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(moduleName);
      tsCompilerRegistered = true;
      return;
    } catch (error) {
      errors.push(
        error instanceof Error ? error : new Error(String(error ?? ""))
      );
    }
  }

  const detail = errors.at(-1)?.message ?? errors[0]?.message ?? "Unknown error";
  throw new Error(
    `Failed to load TypeScript hook module at "${resolved}". Install ts-node or precompile the hook. ${detail}`
  );
}

@Injectable()
export class HooksLoaderService {
  private readonly logger = new Logger(HooksLoaderService.name);

  resolveModule(entry: string, directory?: string): string {
    const candidate = resolveCandidate(entry, directory);
    return resolveEntry(candidate);
  }

  async importHookModule(entry: string, directory?: string): Promise<HookModule> {
    const resolved = this.resolveModule(entry, directory);
    if (isESM(resolved)) {
      const imported = await importESM(resolved);
      return (imported.default ?? imported) as HookModule;
    }

    this.ensureTypeScriptLoader(resolved);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const imported = require(resolved);
    return (imported.default ?? imported) as HookModule;
  }

  private ensureTypeScriptLoader(resolved: string): void {
    const extension = extname(resolved);
    if (!TS_EXTENSIONS.has(extension)) {
      return;
    }

    if (require.extensions[extension]) {
      return;
    }

    registerTypeScriptCompiler(resolved);
  }

  attachObjectHooks(bus: HookBus, module: HookEventHandlers): void {
    const legacyEventMap: Record<string, HookEventName> = {
      SessionStart: HOOK_EVENTS.sessionStart,
      UserPromptSubmit: HOOK_EVENTS.userPromptSubmit,
      SessionEnd: HOOK_EVENTS.sessionEnd,
      PreCompact: HOOK_EVENTS.preCompact,
      PreToolUse: HOOK_EVENTS.preToolUse,
      BeforeSpawnSubagent: HOOK_EVENTS.beforeSpawnSubagent,
      PostToolUse: HOOK_EVENTS.postToolUse,
      Notification: HOOK_EVENTS.notification,
      Stop: HOOK_EVENTS.stop,
      SubagentStop: HOOK_EVENTS.subagentStop,
    };

    for (const [event, handler] of Object.entries(module) as [
      string,
      HookEventHandlers[HookEventName] | undefined,
    ][]) {
      if (!handler) {
        continue;
      }

      if (typeof handler !== "function") {
        this.logger.warn(
          `Skipping hook "${event}" because the handler is not a function`
        );
        continue;
      }

      let resolvedEvent = event;

      if (!isHookEventName(resolvedEvent)) {
        const translated = legacyEventMap[resolvedEvent];
        if (translated) {
          this.logger.warn(
            `Hook event "${resolvedEvent}" is deprecated; use "${translated}" instead`
          );
          resolvedEvent = translated;
        }
      }

      if (!isHookEventName(resolvedEvent)) {
        this.logger.warn(
          `Skipping hook "${event}" because the event is not recognised`
        );
        continue;
      }

      const hookEvent: HookEventName = resolvedEvent;
      bus.on(hookEvent, handler as HookListener<HookEventName>);
    }
  }
}
