import { describe, expect, it } from "vitest";
import { builtinTools } from "@eddie/tools";
import { DEFAULT_CONFIG } from "../src/defaults";

describe("DEFAULT_CONFIG tools", () => {
  it("includes all builtin tool names in the enabled list", () => {
    const builtinToolNames = builtinTools.map((tool) => tool.name);
    const enabledTools = DEFAULT_CONFIG.tools?.enabled ?? [];

    expect(enabledTools).toEqual(expect.arrayContaining(builtinToolNames));
    expect(new Set(enabledTools).size).toBe(enabledTools.length);
    expect(enabledTools.length).toBe(builtinToolNames.length);
  });
});
