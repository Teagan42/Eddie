import { existsSync, readFileSync, statSync } from "node:fs";
import type { Stats } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function resolveEntry(candidatePath: string): string {
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

export function isESM(filePath: string): boolean {
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
