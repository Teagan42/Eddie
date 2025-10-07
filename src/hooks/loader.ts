import path from "path";
import { pathToFileURL } from "url";
import { HookBus } from "./bus";

export type HookModule =
  | ((bus: HookBus) => void | Promise<void>)
  | Record<string, (...args: unknown[]) => unknown>;

export async function resolveModule(
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

export async function importHookModule(
  entry: string,
  directory?: string
): Promise<HookModule> {
  const resolved = await resolveModule(entry, directory);
  const imported = await import(pathToFileURL(resolved).href);
  return (imported.default ?? imported) as HookModule;
}

export function attachObjectHooks(
  bus: HookBus,
  module: Record<string, unknown>
): void {
  for (const [event, handler] of Object.entries(module)) {
    if (typeof handler === "function") {
      bus.on(event, handler as (...args: unknown[]) => void);
    }
  }
}
