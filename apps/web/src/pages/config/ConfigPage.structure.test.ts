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

  it("lays out configuration studio stats with responsive flex panels", () => {
    const source = readFileSync(
      resolve(__dirname, "./ConfigPage.tsx"),
      "utf8"
    );

    expect(source).toContain(
      '<Flex direction={{ initial: "column", md: "row" }} wrap="wrap" gap="3" className="w-full max-w-xl"'
    );
    expect(source).not.toContain("className=\"grid w-full max-w-xl\"");
  });
});
