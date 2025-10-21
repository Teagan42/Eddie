import { existsSync, readFileSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPORT_PREFERENCE = ["import", "default", "node", "module", "require"] as const;

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

  const extension = extname(candidate);

  if (!existsSync(candidate)) {
    if (!extension) {
      for (const add of [".js", ".cjs", ".mjs", ".ts", ".cts"]) {
        const probe = candidate + add;
        if (existsSync(probe)) {
          return probe;
        }
      }
    }

    throw new Error(`Plugin path does not exist: ${candidate}`);
  }

  const stats: Stats = statSync(candidate);
  if (stats.isDirectory()) {
    const pkgJson = join(candidate, "package.json");
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
          candidate
        );
        if (exportTarget) {
          if (exportTarget !== candidate) {
            return resolveEntry(exportTarget);
          }
          return exportTarget;
        }
      }
      if (pkg.module) {
        const moduleEntry = resolve(candidate, pkg.module);
        if (moduleEntry !== candidate) {
          return resolveEntry(moduleEntry);
        }
        return moduleEntry;
      }
      if (pkg.main) {
        const mainEntry = resolve(candidate, pkg.main);
        if (mainEntry !== candidate) {
          return resolveEntry(mainEntry);
        }
        return mainEntry;
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

  return candidate;
}

export function isESM(filePath: string): boolean {
  if (filePath.endsWith(".mts")) {
    return true;
  }
  if (filePath.endsWith(".cts")) {
    return false;
  }
  if (filePath.endsWith(".ts")) {
    return false;
  }
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
