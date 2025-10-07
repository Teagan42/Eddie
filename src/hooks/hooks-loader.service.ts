import { Injectable, Logger } from "@nestjs/common";
import path from "path";
import { pathToFileURL } from "url";
import { HookBus } from "./hook-bus.service";
import {
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

      if (!isHookEventName(event)) {
        this.logger.warn(
          `Skipping hook "${event}" because the event is not recognised`
        );
        continue;
      }

      bus.on(event, handler);
    }
  }
}
