import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function createTempPluginDir(
  contents: string,
  pkgJson: Record<string, unknown>
) {
  const dir = mkdtempSync(join(tmpdir(), "hooks-plugin-"));
  writeFileSync(join(dir, "hook.mjs"), contents, "utf8");
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkgJson), "utf8");
  return dir;
}
