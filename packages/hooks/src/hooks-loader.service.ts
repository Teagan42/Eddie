import { Injectable, Logger } from "@nestjs/common";
import { existsSync, readFileSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HookBus } from "./hook-bus.service";
import {
  HOOK_EVENTS,
  type HookEventHandlers,
  isHookEventName,
  type HookEventName,
  type HookListener,
} from "./types";

export type { HookEventHandlers } from "./types";

export type HookModule =
  | ((bus: HookBus) => void | Promise<void>)
  | HookEventHandlers;

function resolveEntry(candidatePath: string): string {
  const candidate = isAbsolute(candidatePath)
    ? candidatePath
    : resolve(candidatePath);

  if (!existsSync(candidate)) {
    throw new Error(`Plugin path does not exist: ${candidate}`);
  }

  const stats: Stats = statSync(candidate);
  if (stats.isDirectory()) {
    const pkgJson = join(candidate, "package.json");
    if (existsSync(pkgJson)) {
      const pkg = JSON.parse(readFileSync(pkgJson, "utf8"));
      if (typeof pkg.exports === "string") {
        return resolve(candidate, pkg.exports);
      }
      if (pkg.module) {
        return resolve(candidate, pkg.module);
      }
      if (pkg.main) {
        return resolve(candidate, pkg.main);
      }
    }

    const indexCandidates = ["index.mjs", "index.cjs", "index.js"].map((file) =>
      resolve(candidate, file)
    );
    const hit = indexCandidates.find(existsSync);
    if (hit) {
      return hit;
    }

    throw new Error(
      `No entry found in ${candidate}. Add package.json with "main"/"exports" or an index.js`
    );
  }

  const extension = extname(candidate);
  if (!extension) {
    for (const add of [".js", ".cjs", ".mjs"]) {
      const probe = candidate + add;
      if (existsSync(probe)) {
        return probe;
      }
    }
  }

  return candidate;
}

function isESM(filePath: string): boolean {
  if (filePath.endsWith(".mjs")) {
    return true;
  }
  if (filePath.endsWith(".cjs")) {
    return false;
  }

  let dir = resolve(filePath);
  while (true) {
    const parent = resolve(dir, "..");
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, "utf8"));
        return json.type === "module";
      } catch {
        return false;
      }
    }

    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return false;
}

async function importESM(file: string) {
  const href = pathToFileURL(file).href + `?v=${Date.now()}`;
  return import(href);
}

function resolveCandidate(entry: string, directory?: string): string {
  if (entry.startsWith(".") || isAbsolute(entry)) {
    return resolve(directory ?? process.cwd(), entry);
  }

  return require.resolve(entry, {
    paths: [directory ?? process.cwd()],
  });
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
