import { describe, expect, it } from "vitest";

import { resolveEntry } from "../src/utils";
import { createTempPluginDir } from "./support/temp-plugin";

describe("resolveEntry", () => {
  it("resolves directories via the package.json module field", () => {
    const pluginDir = createTempPluginDir(
      "export default () => 'from-utils';\n",
      { module: "./hook.mjs" }
    );

    const resolved = resolveEntry(pluginDir);

    expect(resolved.endsWith("hook.mjs")).toBe(true);
  });
});
