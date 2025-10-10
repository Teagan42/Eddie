import { describe, expect, it } from "vitest";

import { parseRuntimeOptionsFromArgv } from "../../../src/runtime-options";

describe("parseRuntimeOptionsFromArgv", () => {
  it("deduplicates list-valued options while preserving order", () => {
    const options = parseRuntimeOptionsFromArgv([
      "--context",
      "src,docs",
      "--context",
      "src",
      "--tools",
      "lint,format",
      "--tools",
      "lint",
      "--disable-tools",
      "write",
      "--disable-tools",
      "format",
      "--disable-tools",
      "write",
    ]);

    expect(options.context).toEqual(["src", "docs"]);
    expect(options.tools).toEqual(["lint", "format"]);
    expect(options.disabledTools).toEqual(["write", "format"]);
  });
});
