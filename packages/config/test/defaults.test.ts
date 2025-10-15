import { describe, expect, it } from "vitest";
import { builtinTools } from "@eddie/tools";
import { DEFAULT_CONFIG } from "../src/defaults";
import { CURRENT_CONFIG_VERSION } from "../src/migrations";

describe("DEFAULT_CONFIG tools", () => {
  it("includes all builtin tool names in the enabled list", () => {
    const builtinToolNames = builtinTools.map((tool) => tool.name);
    const enabledTools = DEFAULT_CONFIG.tools?.enabled ?? [];

    expect(enabledTools).toEqual(expect.arrayContaining(builtinToolNames));
    expect(new Set(enabledTools).size).toBe(enabledTools.length);
    expect(enabledTools.length).toBe(builtinToolNames.length);
  });

  it("tracks the current configuration version", () => {
    expect(DEFAULT_CONFIG.version).toBe(CURRENT_CONFIG_VERSION);
  });
});
