import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getRuntimeOptions,
  parseRuntimeOptionsFromArgv,
  resetRuntimeOptionsCache,
} from "../../../src/runtime-options";

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

describe("getRuntimeOptions", () => {
  const originalArgv = process.argv.slice();

  beforeEach(() => {
    resetRuntimeOptionsCache();
    process.argv = originalArgv.slice();
  });

  afterEach(() => {
    resetRuntimeOptionsCache();
    process.argv = originalArgv.slice();
  });

  it("ignores process argv when runtime options are not initialised", () => {
    process.argv = [
      "/usr/bin/node",
      "/usr/bin/vitest",
      "--config",
      "apps/api/vitest.config.ts",
      "--runInBand",
    ];

    const options = getRuntimeOptions();

    expect(options).toEqual({});
  });
});
