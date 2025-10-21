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

  it("loads TypeScript hook modules referenced without an extension", async () => {
    const service = new HooksLoaderService();
    const pluginDir = createTempPluginDir(
      "export default () => 'ts-module-loaded';\n",
      { main: "./hook" },
      "hook.ts"
    );

    const originalTsLoader = require.extensions[".ts"];
    // Simulate a Node.js environment without a TypeScript loader registered.
    delete require.extensions[".ts"];

    try {
      const loaded = await service.importHookModule(pluginDir);

      expect(typeof loaded).toBe("function");
      expect(loaded()).toBe("ts-module-loaded");
    } finally {
      if (originalTsLoader) {
        require.extensions[".ts"] = originalTsLoader;
      } else {
        delete require.extensions[".ts"];
      }
    }
  });
});
