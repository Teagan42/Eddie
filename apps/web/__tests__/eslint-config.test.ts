import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("eslint config", () => {
  it("ignores vendor directory", () => {
    const config = require("../eslint.config.cjs");

    const ignores = config[0]?.ignores ?? [];

    expect(ignores).toContain("src/vendor/**/*");
  });
});
