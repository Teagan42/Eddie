import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("ConfigPage structure", () => {
  it("uses Panel instead of Card wrappers", () => {
    const source = readFileSync(
      resolve(__dirname, "./ConfigPage.tsx"),
      "utf8"
    );

    expect(source).toContain("<Panel");
    expect(source).not.toContain("<Card");
  });
});
