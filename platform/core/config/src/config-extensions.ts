import fs from "fs/promises";
import path from "path";

import type {
  ConfigExtensionDescriptor,
  ConfigExtensionEntry,
  ConfigExtensionReference,
} from "@eddie/types";

import { getConfigRoot } from "./config-path";
import { CONFIG_PRESET_NAMES } from "./presets";

const CONFIG_PRESET_NAME_SET = new Set<string>(CONFIG_PRESET_NAMES);
const PRESET_PREFIX = "preset:";

export interface ConfigExtensionLogger {
  warn(message: string): void;
}

export interface ConfigExtensionNormalizationOptions {
  logger?: ConfigExtensionLogger;
}

const noopLogger: ConfigExtensionLogger = { warn: () => {} };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function normalizeConfigExtensionDescriptor(
  descriptor: ConfigExtensionDescriptor | undefined | null,
  options?: ConfigExtensionNormalizationOptions,
): ConfigExtensionEntry[] {
  if (!descriptor) {
    return [];
  }

  const { logger = noopLogger } = options ?? {};
  const entries: ConfigExtensionEntry[] = [];

  const presetId = isNonEmptyString(descriptor.id)
    ? descriptor.id.trim()
    : "";
  if (presetId.length > 0) {
    entries.push({ type: "preset", id: presetId });
  }

  const filePath = isNonEmptyString(descriptor.path)
    ? descriptor.path.trim()
    : "";
  if (filePath.length > 0) {
    entries.push({ type: "file", path: filePath });
  }

  if (presetId.length === 0 && filePath.length === 0) {
    logger.warn("[Config] Skipping config extension without id or path.");
  }

  return entries;
}

export function normalizeConfigExtensions(
  references: ConfigExtensionReference[] | undefined,
  options?: ConfigExtensionNormalizationOptions,
): ConfigExtensionEntry[] {
  if (!Array.isArray(references) || references.length === 0) {
    return [];
  }

  const { logger = noopLogger } = options ?? {};
  const entries: ConfigExtensionEntry[] = [];

  for (const reference of references) {
    if (!reference) {
      continue;
    }

    if (typeof reference === "string") {
      const trimmed = reference.trim();
      if (trimmed.length === 0) {
        logger.warn("[Config] Skipping empty config extension reference.");
        continue;
      }

      if (trimmed.startsWith(PRESET_PREFIX)) {
        const presetId = trimmed.slice(PRESET_PREFIX.length).trim();
        if (presetId.length === 0) {
          logger.warn(
            "[Config] Skipping preset extension without an identifier.",
          );
          continue;
        }
        entries.push({ type: "preset", id: presetId });
        continue;
      }

      if (CONFIG_PRESET_NAME_SET.has(trimmed)) {
        entries.push({ type: "preset", id: trimmed });
        continue;
      }

      entries.push({ type: "file", path: trimmed });
      continue;
    }

    entries.push(...normalizeConfigExtensionDescriptor(reference, options));
  }

  return entries;
}

export interface ResolveConfigExtensionPathOptions {
  contextPath?: string | null;
  configFilePath?: string | null;
}

export async function resolveConfigExtensionPath(
  candidate: string,
  options: ResolveConfigExtensionPathOptions = {},
): Promise<string> {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    throw new Error("Config extension path must be a non-empty string.");
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  const contextPath = isNonEmptyString(options.contextPath)
    ? options.contextPath
    : null;
  let normalizedContextPath: string | null = null;
  if (contextPath) {
    normalizedContextPath = path.isAbsolute(contextPath)
      ? contextPath
      : path.resolve(process.cwd(), contextPath);
  }

  const configuredPath = isNonEmptyString(options.configFilePath)
    ? options.configFilePath
    : null;

  const baseCandidates = [
    normalizedContextPath ? path.dirname(normalizedContextPath) : null,
    configuredPath ? path.dirname(configuredPath) : null,
    getConfigRoot(),
    process.cwd(),
  ].filter((value, index, array): value is string => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return false;
    }
    return array.indexOf(value) === index;
  });

  for (const baseDir of baseCandidates) {
    const resolved = path.resolve(baseDir, trimmed);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // continue searching
    }
  }

  const fallbackBase = baseCandidates[0] ?? process.cwd();
  return path.resolve(fallbackBase, trimmed);
}
