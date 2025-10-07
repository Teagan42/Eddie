import { Injectable, Logger } from "@nestjs/common";
import path from "path";
import { pathToFileURL } from "url";
import { HookBus } from "./hook-bus.service";

export type HookModule =
  | ((bus: HookBus) => void | Promise<void>)
  | Record<string, (...args: unknown[]) => unknown>;

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

  attachObjectHooks(bus: HookBus, module: Record<string, unknown>): void {
    for (const [event, handler] of Object.entries(module)) {
      if (typeof handler === "function") {
        bus.on(event, handler as (...args: unknown[]) => void);
        continue;
      }

      this.logger.warn(`Skipping hook "${event}" because the handler is not a function`);
    }
  }
}
