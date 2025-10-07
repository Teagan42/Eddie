import { Injectable, Logger } from "@nestjs/common";
import path from "path";
import { pathToFileURL } from "url";
import { HookBus } from "./hook-bus.service";
import {
  HOOK_EVENTS,
  type HookEventHandlers,
  isHookEventName,
  type HookEventName,
} from "./types";

export type { HookEventHandlers } from "./types";

export type HookModule =
  | ((bus: HookBus) => void | Promise<void>)
  | HookEventHandlers;

@Injectable()
export class HooksLoaderService {
  private readonly logger = new Logger(HooksLoaderService.name);

  resolveModule(entry: string, directory?: string): string {
    if (entry.startsWith(".") || entry.startsWith("/")) {
      return path.resolve(directory ?? process.cwd(), entry);
    }

    return require.resolve(entry, {
      paths: [directory ?? process.cwd()],
    });
  }

  async importHookModule(entry: string, directory?: string): Promise<HookModule> {
    const resolved = this.resolveModule(entry, directory);
    const imported = await import(pathToFileURL(resolved).href);
    return (imported.default ?? imported) as HookModule;
  }

  attachObjectHooks(bus: HookBus, module: HookEventHandlers): void {
    const legacyEventMap: Record<string, HookEventName> = {
      SessionStart: HOOK_EVENTS.sessionStart,
      UserPromptSubmit: HOOK_EVENTS.userPromptSubmit,
      SessionEnd: HOOK_EVENTS.sessionEnd,
      PreCompact: HOOK_EVENTS.preCompact,
      PreToolUse: HOOK_EVENTS.preToolUse,
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

      bus.on(resolvedEvent, handler);
    }
  }
}
