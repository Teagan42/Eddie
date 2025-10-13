import { describe, expect, it } from "vitest";

import { mergeCliRuntimeOptions } from "../src/runtime-cli";
import type { CliRuntimeOptions } from "../src/types";

describe("mergeCliRuntimeOptions", () => {
  it("clones list properties from the base runtime options", () => {
    const base: CliRuntimeOptions = {
      context: ["src"],
      tools: ["lint"],
      disabledTools: ["format"],
    };

    const overrides: CliRuntimeOptions = {};

    const merged = mergeCliRuntimeOptions(base, overrides);

    expect(merged.context).toEqual(["src"]);
    expect(merged.tools).toEqual(["lint"]);
    expect(merged.disabledTools).toEqual(["format"]);

    expect(merged.context).not.toBe(base.context);
    expect(merged.tools).not.toBe(base.tools);
    expect(merged.disabledTools).not.toBe(base.disabledTools);
  });
});
