import path from "path";
import { pathToFileURL } from "url";
import type { HooksConfig } from "../config/types";
import { HookBus } from "./bus";

type HookModule =
  | ((bus: HookBus) => void | Promise<void>)
  | Record<string, (...args: unknown[]) => unknown>;

async function resolveModule(
  entry: string,
  directory?: string
): Promise<string> {
  if (entry.startsWith(".") || entry.startsWith("/")) {
    return path.resolve(directory ?? process.cwd(), entry);
  }
  return require.resolve(entry, {
    paths: [directory ?? process.cwd()],
  });
}

function attachObjectHooks(bus: HookBus, module: Record<string, unknown>) {
  for (const [event, handler] of Object.entries(module)) {
    if (typeof handler === "function") {
      bus.on(event, handler as (...args: unknown[]) => void);
    }
  }
}

export async function loadHooks(config?: HooksConfig): Promise<HookBus> {
  const bus = new HookBus();
  if (!config?.modules?.length) {
    return bus;
  }

  for (const entry of config.modules) {
    try {
      const resolved = await resolveModule(entry, config.directory);
      const imported = await import(pathToFileURL(resolved).href);
      const hookModule: HookModule = (imported.default ?? imported) as HookModule;
      if (typeof hookModule === "function") {
        await hookModule(bus);
      } else if (hookModule && typeof hookModule === "object") {
        attachObjectHooks(bus, hookModule as Record<string, unknown>);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to load hook module "${entry}"`, error);
    }
  }

  return bus;
}
