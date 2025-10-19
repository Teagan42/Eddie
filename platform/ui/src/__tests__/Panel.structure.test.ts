import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("panel header layout", () => {
  it("exposes responsive header alignment without constraining actions", () => {
    const source = readFileSync(resolve(__dirname, "../common/Panel.tsx"), "utf8");

    expect(source).toContain(
      'className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between"'
    );
    expect(source).not.toContain('className="flex items-center gap-2"');
  });

  it("wraps the surface with a Radix UI Box for consistent hero styling", () => {
    const source = readFileSync(resolve(__dirname, "../common/Panel.tsx"), "utf8");

    expect(source).toContain('import { Box } from "@radix-ui/themes"');
    expect(source).toContain("<Box");
  });
});
