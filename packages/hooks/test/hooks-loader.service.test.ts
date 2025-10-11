import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { HooksLoaderService } from "../src/hooks-loader.service";

function createTempPluginDir(contents: string, pkgJson: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), "hooks-loader-"));
  writeFileSync(join(dir, "hook.mjs"), contents, "utf8");
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkgJson), "utf8");
  return dir;
}

describe("HooksLoaderService", () => {
  it("loads hook modules referenced by package.json module field", async () => {
    const service = new HooksLoaderService();
    const pluginDir = createTempPluginDir(
      "export default () => 'module-loaded';\n",
      { module: "./hook.mjs" }
    );

    const loaded = await service.importHookModule(pluginDir);

    expect(typeof loaded).toBe("function");
    expect(loaded()).toBe("module-loaded");
  });
});
