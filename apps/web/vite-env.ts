import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnv } from "vite";

function findRepoRoot(workspaceRoot: string) {
  let candidate = dirname(workspaceRoot);

  while (candidate !== dirname(candidate)) {
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }

    candidate = dirname(candidate);
  }

  return existsSync(join(candidate, "package.json")) ? candidate : workspaceRoot;
}

export function loadWorkspaceEnv(mode: string, workspaceRoot: string) {
  const repoRoot = findRepoRoot(workspaceRoot);
  const rootEnv = loadEnv(mode, repoRoot, "");
  const workspaceEnv = loadEnv(mode, workspaceRoot, "");
  const mergedEnv = { ...rootEnv, ...workspaceEnv };

  Object.assign(process.env, mergedEnv);

  return mergedEnv;
}
