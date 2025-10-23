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

  it("disables memory features by default", () => {
    expect(DEFAULT_CONFIG.memory).toEqual({
      enabled: false,
      facets: {
        defaultStrategy: "none",
      },
      vectorStore: {
        provider: "qdrant",
        qdrant: {
          url: "http://localhost:6333",
          apiKey: undefined,
          collection: "eddie-memory",
          timeoutMs: 5000,
        },
      },
    });

    expect(DEFAULT_CONFIG.agents.manager?.memory).toEqual({
      recall: false,
      store: false,
    });
  });
});
