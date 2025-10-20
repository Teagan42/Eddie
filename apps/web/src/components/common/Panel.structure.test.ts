import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PANEL_SOURCE_PATH = resolve(
  __dirname,
  "../../../../../platform/ui/src/common/Panel.tsx",
);

describe("panel header layout", () => {
  it("exposes responsive header alignment without constraining actions", () => {
    const source = readFileSync(PANEL_SOURCE_PATH, "utf8");

    expect(source).toContain(
      "const PANEL_HEADER_CLASS =\n  'flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between';"
    );
    expect(source).toContain('className={PANEL_HEADER_CLASS}');
  });

  it("wraps the surface with a Radix UI Box for consistent hero styling", () => {
    const source = readFileSync(PANEL_SOURCE_PATH, "utf8");

    expect(source).toContain('import { Box } from "@radix-ui/themes"');
    expect(source).toContain('import { clsx } from "clsx"');
    expect(source).toContain("<Box");
  });
});
