import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("eslint config", () => {
  const VENDOR_IGNORE_GLOB = "src/vendor/**/*";

  it("ignores vendor directory", () => {
    const config = require("../eslint.config.cjs");

    const ignores = config[0]?.ignores ?? [];

    expect(ignores).toContain(VENDOR_IGNORE_GLOB);
    expect(ignores).not.toContain("**src/vendor/**/*");
  });
});
