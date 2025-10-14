import { Injectable, Logger } from "@nestjs/common";
import type { LoggerService } from "@nestjs/common";
import { HookBus } from "./hook-bus.service";
import {
  HOOK_EVENTS,
  type HookEventHandlers,
  isHookEventName,
  type HookEventName,
  type HookListener,
} from "./types";
import {
  importESM,
  isESM,
  resolveCandidate,
  resolveEntry,
} from "./utils";

export type { HookEventHandlers } from "./types";

export type HookInstaller = (
  bus: HookBus,
  logger: LoggerService
) => void | Promise<void>;

export type HookModule = HookInstaller | HookEventHandlers;

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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const imported = require(resolved);
    return (imported.default ?? imported) as HookModule;
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
