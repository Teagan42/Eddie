import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("overview stats grid theming", () => {
  it("applies midnight console icon backgrounds", () => {
    const source = readFileSync(resolve(__dirname, "./OverviewStatsGrid.tsx"), "utf8");

    expect(source).toContain('bg-[color:var(--hero-console-icon-bg)]');
    expect(source).toContain('dark:bg-[color:var(--hero-console-icon-bg-dark)]');
  });
});
