import { existsSync, readFileSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPORT_PREFERENCE = ["import", "default", "node", "module", "require"] as const;
const EXTENSION_PREFERENCE = [
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".cts",
  ".mts",
] as const;

function resolveFilePath(basePath: string): string | undefined {
  if (existsSync(basePath)) {
    return basePath;
  }

  if (extname(basePath)) {
    return undefined;
  }

  for (const extension of EXTENSION_PREFERENCE) {
    const candidate = basePath + extension;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function resolveExportsTarget(
  target: unknown,
  baseDir: string
): string | undefined {
  if (!target) {
    return undefined;
  }

  if (typeof target === "string") {
    return resolve(baseDir, target);
  }

  if (Array.isArray(target)) {
    for (const entry of target) {
      const resolved = resolveExportsTarget(entry, baseDir);
      if (resolved) {
        return resolved;
      }
    }
    return undefined;
  }

  if (typeof target === "object") {
    const record = target as Record<string, unknown>;
    for (const key of EXPORT_PREFERENCE) {
      if (key in record) {
        const resolved = resolveExportsTarget(record[key], baseDir);
        if (resolved) {
          return resolved;
        }
      }
    }

    if ("." in record) {
      const resolved = resolveExportsTarget(record["."], baseDir);
      if (resolved) {
        return resolved;
      }
    }

    for (const value of Object.values(record)) {
      const resolved = resolveExportsTarget(value, baseDir);
      if (resolved) {
        return resolved;
      }
    }
  }

  return undefined;
}

export function resolveEntry(candidatePath: string): string {
  const candidate = isAbsolute(candidatePath)
    ? candidatePath
    : resolve(candidatePath);

  const resolvedCandidate = resolveFilePath(candidate);
  if (!resolvedCandidate) {
    throw new Error(`Plugin path does not exist: ${candidate}`);
  }

  const stats: Stats = statSync(resolvedCandidate);
  if (stats.isDirectory()) {
    const pkgJson = join(resolvedCandidate, "package.json");
    if (existsSync(pkgJson)) {
      const pkg = JSON.parse(readFileSync(pkgJson, "utf8"));
      if (pkg.exports) {
        const exportsField = pkg.exports;
        const normalizedExports =
          typeof exportsField === "object" &&
          exportsField !== null &&
          !Array.isArray(exportsField) &&
          "." in exportsField
            ? (exportsField as Record<string, unknown>)["."]
            : exportsField;
        const exportTarget = resolveExportsTarget(
          normalizedExports,
          resolvedCandidate
        );
        if (exportTarget) {
          const resolvedExport = normalizeResolvedTarget(
            resolveFilePath(exportTarget) ?? exportTarget,
            resolvedCandidate
          );
          if (resolvedExport) {
            return resolvedExport;
          }
        }
      }
      if (pkg.module) {
        const moduleEntry = resolve(resolvedCandidate, pkg.module);
        const resolvedModule = normalizeResolvedTarget(
          resolveFilePath(moduleEntry),
          resolvedCandidate
        );
        if (resolvedModule) {
          return resolvedModule;
        }
      }
      if (pkg.main) {
        const mainEntry = resolve(resolvedCandidate, pkg.main);
        const resolvedMain = normalizeResolvedTarget(
          resolveFilePath(mainEntry),
          resolvedCandidate
        );
        if (resolvedMain) {
          return resolvedMain;
        }
      }
    }

    const indexCandidates = [
      "index.mjs",
      "index.cjs",
      "index.js",
      "index.mts",
      "index.cts",
      "index.ts",
    ].map((file) => resolve(resolvedCandidate, file));
    const hit = indexCandidates.find(existsSync);
    if (hit) {
      return hit;
    }

    throw new Error(
      `No entry found in ${resolvedCandidate}. Add package.json with "main"/"exports" or an index.js`
    );
  }

  return resolvedCandidate;
}

export function isESM(filePath: string): boolean {
  if (filePath.endsWith(".mjs") || filePath.endsWith(".mts")) {
    return true;
  }
  if (filePath.endsWith(".cjs") || filePath.endsWith(".cts")) {
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

function normalizeResolvedTarget(
  target: string | undefined,
  root: string
): string | undefined {
  if (!target) {
    return undefined;
  }

  if (!existsSync(target)) {
    return undefined;
  }

  const stats = statSync(target);
  if (stats.isDirectory() && target !== root) {
    return resolveEntry(target);
  }

  return target;
}

export async function importESM(file: string) {
  const href = pathToFileURL(file).href + `?v=${Date.now()}`;
  return import(href);
}

export function resolveCandidate(entry: string, directory?: string): string {
  if (entry.startsWith(".") || isAbsolute(entry)) {
    return resolve(directory ?? process.cwd(), entry);
  }

  return require.resolve(entry, {
    paths: [directory ?? process.cwd()],
  });
}
