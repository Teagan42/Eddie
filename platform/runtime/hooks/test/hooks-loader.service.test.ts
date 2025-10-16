import { describe, expect, it } from "vitest";

import { HooksLoaderService } from "../src/hooks-loader.service";
import { createTempPluginDir } from "./support/temp-plugin";

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
