import fs from "fs/promises";
import path from "path";
import type { CliRuntimeOptions } from "./types";

const DEFAULT_CONFIG_ROOT = path.resolve(process.cwd(), "config");

export const CONFIG_FILENAMES = [
  "eddie.config.json",
  "eddie.config.yaml",
  "eddie.config.yml",
  ".eddierc",
  ".eddierc.json",
  ".eddierc.yaml",
];

export function getConfigRoot(): string {
  const override = process.env.CONFIG_ROOT;
  if (override && override.trim().length > 0) {
    return path.resolve(process.cwd(), override);
  }
  return DEFAULT_CONFIG_ROOT;
}

export function collectConfigRoots(): string[] {
  const roots = new Set<string>();
  roots.add(getConfigRoot());
  roots.add(process.cwd());
  return Array.from(roots);
}

export async function resolveConfigFilePath(
  options: CliRuntimeOptions,
): Promise<string | null> {
  if (options.config) {
    const explicit = path.resolve(options.config);
    try {
      await fs.access(explicit);
      return explicit;
    } catch {
      throw new Error(`Config file not found at ${explicit}`);
    }
  }

  const searchRoots = collectConfigRoots();
  for (const rootDir of searchRoots) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = path.resolve(rootDir, name);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // keep searching
      }
    }
  }

  return null;
}
